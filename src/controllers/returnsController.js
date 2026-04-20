const pool = require('../utils/db');
const { logAudit } = require('./auditController');

const ensureTable = pool.query(`
  CREATE TABLE IF NOT EXISTS sale_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES sales(id),
    sale_item_id UUID,
    product_id UUID REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity INT NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    refund_amount NUMERIC(12,2) NOT NULL,
    reason TEXT,
    processed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(console.error);

const getReturns = async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let conditions = [];
    let params = [];
    let idx = 1;
    if (startDate) { conditions.push(`DATE(sr.created_at AT TIME ZONE 'Africa/Lagos') >= $${idx++}`); params.push(startDate); }
    if (endDate) { conditions.push(`DATE(sr.created_at AT TIME ZONE 'Africa/Lagos') <= $${idx++}`); params.push(endDate); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRow] = await Promise.all([
      pool.query(`
        SELECT sr.*, u.name as processed_by_name, s.receipt_number
        FROM sale_returns sr
        LEFT JOIN users u ON sr.processed_by = u.id
        LEFT JOIN sales s ON sr.sale_id = s.id
        ${where}
        ORDER BY sr.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM sale_returns sr ${where}`, params),
    ]);

    res.json({
      returns: rows.rows,
      total: parseInt(countRow.rows[0].count),
      totalPages: Math.ceil(parseInt(countRow.rows[0].count) / parseInt(limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const processReturn = async (req, res) => {
  const client = await pool.connect();
  try {
    const { sale_id, items, reason } = req.body;
    if (!sale_id || !items?.length) return res.status(400).json({ error: 'sale_id and items required' });

    await client.query('BEGIN');

    const saleRes = await client.query('SELECT * FROM sales WHERE id=$1', [sale_id]);
    if (!saleRes.rows.length) return client.query('ROLLBACK').then(() => res.status(404).json({ error: 'Sale not found' }));

    const returnedItems = [];
    let totalRefund = 0;

    for (const item of items) {
      const { product_id, product_name, quantity, unit_price } = item;
      if (!quantity || quantity <= 0) continue;
      const refund = parseFloat(unit_price) * parseInt(quantity);
      totalRefund += refund;

      await client.query(`
        INSERT INTO sale_returns (sale_id, product_id, product_name, quantity, unit_price, refund_amount, reason, processed_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [sale_id, product_id, product_name, quantity, unit_price, refund, reason, req.user.id]);

      await client.query(
        'UPDATE products SET quantity = quantity + $1, updated_at=NOW() WHERE id=$2',
        [quantity, product_id]
      );

      returnedItems.push({ product_name, quantity, refund });
    }

    await client.query('COMMIT');
    logAudit(req.user.id, req.user.name, 'RETURN_PROCESSED', 'sale', sale_id, { refund: totalRefund, items: returnedItems, reason }, req.ip);
    res.json({ message: 'Return processed', refund_total: totalRefund, items: returnedItems });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

module.exports = { getReturns, processReturn };
