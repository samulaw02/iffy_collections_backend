const pool = require('../utils/db');
const { logAudit } = require('./auditController');
const { createJob, getJob, updateJob } = require('../utils/jobStore');

const IMPORT_BATCH_SIZE = 25; // rows per DB transaction — keeps connections short-lived

// ─── Single-batch runner ─────────────────────────────────────────────────────
// Processes one slice of products inside a single transaction.
// rowOffset is the absolute index of batch[0] in the full product array.
async function runBatch(batch, rowOffset, userId, categoryMap) {
  const client = await pool.connect();
  const created = [];
  const failed  = [];

  try {
    // Disable Supabase's default statement timeout for this session so long-running
    // inserts (especially on cold-start) are never cancelled mid-batch
    await client.query('SET statement_timeout = 0');
    await client.query('BEGIN');

    for (let i = 0; i < batch.length; i++) {
      const row    = batch[i];
      const rowNum = rowOffset + i + 1;

      // Validate before touching the DB
      const name        = (row.name || '').trim();
      const retailPrice = parseFloat(String(row.retail_price || '').replace(/,/g, ''));
      if (!name) { failed.push({ row: rowNum, name: row.name, error: 'Name is required' }); continue; }
      if (isNaN(retailPrice) || retailPrice < 0) { failed.push({ row: rowNum, name, error: 'Valid retail price is required' }); continue; }

      // Savepoint isolates this row — a DB error won't abort the whole transaction
      await client.query(`SAVEPOINT row_${i}`);
      try {
        // Resolve or auto-create category
        let categoryId = null;
        const catName = (row.category || '').trim();
        if (catName) {
          const key = catName.toLowerCase();
          if (categoryMap[key]) {
            categoryId = categoryMap[key];
          } else {
            const newCat = await client.query(
              `INSERT INTO categories (name) VALUES ($1)
               ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name
               RETURNING id`,
              [catName]
            );
            categoryId = newCat.rows[0].id;
            categoryMap[key] = categoryId; // share across batches
          }
        }

        const sku = (row.sku || '').trim() || null;
        const qty = parseInt(row.quantity) || 0;
        const lst = parseInt(row.low_stock_threshold);

        const result = await client.query(`
          INSERT INTO products
            (name, sku, category_id, description, price, wholesale_price, cost_price,
             quantity, low_stock_threshold, size, color, gender, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          RETURNING id, name
        `, [
          name,
          sku,
          categoryId,
          (row.description || '').trim() || null,
          retailPrice,
          parseFloat(String(row.wholesale_price || '').replace(/,/g, '')) || 0,
          parseFloat(String(row.cost_price    || '').replace(/,/g, '')) || 0,
          qty,
          isNaN(lst) ? 5 : lst,
          (row.size   || '').trim() || null,
          (row.color  || '').trim() || null,
          (row.gender || '').trim() || null,
          userId,
        ]);

        if (qty > 0) {
          await client.query(`
            INSERT INTO stock_adjustments
              (product_id, adjusted_by, previous_qty, new_qty, adjustment, reason, type)
            VALUES ($1,$2,0,$3,$3,'Bulk import','initial')
          `, [result.rows[0].id, userId, qty]);
        }

        await client.query(`RELEASE SAVEPOINT row_${i}`);
        created.push({ row: rowNum, name, id: result.rows[0].id });
      } catch (rowErr) {
        await client.query(`ROLLBACK TO SAVEPOINT row_${i}`);
        const msg = rowErr.code === '23505' ? 'SKU already exists' : rowErr.message;
        failed.push({ row: rowNum, name, error: msg });
      }
    }

    await client.query('COMMIT');
    return { created, failed };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release(); // connection returned to pool after every batch
  }
}

// ─── Full import runner ──────────────────────────────────────────────────────
// Splits products into batches of IMPORT_BATCH_SIZE.
// onProgress(createdSoFar, failedSoFar) is called after each batch (optional).
async function runImport(products, userId, onProgress) {
  // Pre-load categories once — shared (by reference) across all batches
  const catRows = await pool.query('SELECT id, name FROM categories');
  const categoryMap = {};
  catRows.rows.forEach(c => { categoryMap[c.name.toLowerCase()] = c.id; });

  const allCreated = [];
  const allFailed  = [];

  for (let offset = 0; offset < products.length; offset += IMPORT_BATCH_SIZE) {
    const batch = products.slice(offset, offset + IMPORT_BATCH_SIZE);
    const { created, failed } = await runBatch(batch, offset, userId, categoryMap);
    allCreated.push(...created);
    allFailed.push(...failed);
    onProgress?.(allCreated.length, allFailed.length);
  }

  return { created: allCreated, failed: allFailed };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

const getProducts = async (req, res) => {
  try {
    const { category, search, lowStock, page = 1, limit = 50 } = req.query;
    let conditions = ['p.is_active = true'];
    let params = [];
    let idx = 1;

    if (category) { conditions.push(`c.name ILIKE $${idx++}`); params.push(`%${category}%`); }
    if (search) { conditions.push(`(p.name ILIKE $${idx} OR p.sku ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (lowStock === 'true') conditions.push('p.quantity <= p.low_stock_threshold');

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await pool.query(`
      SELECT p.*, c.name as category_name,
        u.name as created_by_name,
        CASE
          WHEN p.quantity = 0 THEN 'out_of_stock'
          WHEN p.quantity <= p.low_stock_threshold THEN 'low_stock'
          ELSE 'in_stock'
        END as stock_status
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, limit, offset]);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id ${where}`,
      params
    );

    res.json({
      products: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getProduct = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name as category_name FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = $1 AND p.is_active = true
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const createProduct = async (req, res) => {
  try {
    const { name, sku, category_id, description, price, wholesale_price, cost_price, quantity, low_stock_threshold, size, color, gender, image_url } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and retail price are required' });

    const result = await pool.query(`
      INSERT INTO products (name, sku, category_id, description, price, wholesale_price, cost_price, quantity, low_stock_threshold, size, color, gender, image_url, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [name, sku || null, category_id || null, description, price, wholesale_price || 0, cost_price || 0, quantity || 0, low_stock_threshold || 5, size, color, gender, image_url, req.user.id]);

    if (quantity > 0) {
      await pool.query(`
        INSERT INTO stock_adjustments (product_id, adjusted_by, previous_qty, new_qty, adjustment, reason, type)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [result.rows[0].id, req.user.id, 0, quantity, quantity, 'Initial stock', 'initial']);
    }

    logAudit(req.user.id, req.user.name, 'PRODUCT_CREATED', 'product', result.rows[0].id, { name, sku, price }, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'SKU already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { name, sku, category_id, description, price, wholesale_price, cost_price, low_stock_threshold, size, color, gender, image_url } = req.body;
    const result = await pool.query(`
      UPDATE products SET
        name=COALESCE($1,name), sku=COALESCE($2,sku), category_id=COALESCE($3,category_id),
        description=COALESCE($4,description), price=COALESCE($5,price),
        wholesale_price=COALESCE($6,wholesale_price), cost_price=COALESCE($7,cost_price),
        low_stock_threshold=COALESCE($8,low_stock_threshold), size=COALESCE($9,size),
        color=COALESCE($10,color), gender=COALESCE($11,gender), image_url=COALESCE($12,image_url),
        updated_at=NOW()
      WHERE id=$13 AND is_active=true RETURNING *
    `, [name, sku, category_id, description, price, wholesale_price, cost_price, low_stock_threshold, size, color, gender, image_url, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    logAudit(req.user.id, req.user.name, 'PRODUCT_UPDATED', 'product', req.params.id, { name, price }, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'SKU already exists' });
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    await pool.query('UPDATE products SET is_active=false WHERE id=$1', [req.params.id]);
    logAudit(req.user.id, req.user.name, 'PRODUCT_DELETED', 'product', req.params.id, null, req.ip);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Bulk import ─────────────────────────────────────────────────────────────
const SYNC_THRESHOLD = 50; // ≤ this → synchronous response; > this → background job

const bulkImportProducts = async (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0)
    return res.status(400).json({ error: 'No products provided' });
  if (products.length > 500)
    return res.status(400).json({ error: 'Maximum 500 products per import' });

  // ── Synchronous path (small batch) ────────────────────────────────────────
  if (products.length <= SYNC_THRESHOLD) {
    try {
      const { created, failed } = await runImport(products, req.user.id);
      logAudit(req.user.id, req.user.name, 'PRODUCT_BULK_IMPORT', 'bulk_import', null,
        { count: created.length }, req.ip);
      return res.json({ async: false, created: created.length, failed, total: products.length });
    } catch (err) {
      console.error('Bulk import error:', err);
      return res.status(500).json({ error: 'Bulk import failed' });
    }
  }

  // ── Asynchronous path (large batch) ───────────────────────────────────────
  const jobId = createJob(products.length);

  // Respond immediately so the client never times out
  res.status(202).json({
    async: true,
    jobId,
    total: products.length,
    message: `Import started. Poll /api/products/bulk-import/status/${jobId} for progress.`,
  });

  // Run in background — intentionally not awaited
  setImmediate(async () => {
    try {
      const { created, failed } = await runImport(products, req.user.id, (createdSoFar, failedSoFar) => {
        // Update job progress after every batch so the frontend progress bar moves
        updateJob(jobId, { created: createdSoFar, failed: getJob(jobId)?.failed ?? [] });
      });
      updateJob(jobId, {
        status: 'completed',
        created: created.length,
        failed,
        completedAt: new Date().toISOString(),
      });
      logAudit(req.user.id, req.user.name, 'PRODUCT_BULK_IMPORT', 'bulk_import', null,
        { count: created.length, async: true }, req.ip);
    } catch (err) {
      console.error(`Async bulk import job ${jobId} failed:`, err.message);
      updateJob(jobId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: err.message,
      });
    }
  });
};

// ── Job status endpoint ────────────────────────────────────────────────────
const getBulkImportStatus = (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found or expired' });
  res.json(job);
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkImportProducts,
  getBulkImportStatus,
};
