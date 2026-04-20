const pool = require('../utils/db');
const { logAudit } = require('./auditController');

const generateReceiptNumber = () => {
  const date = new Date();
  const d = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `IC-${d}-${rand}`;
};

const processSale = async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_name, customer_phone, items, discount = 0, payment_method = 'cash', amount_paid, notes } = req.body;

    if (!items || !items.length) return res.status(400).json({ error: 'No items in sale' });

    await client.query('BEGIN');

    // Validate & lock products
    let subtotal = 0;
    const processedItems = [];

    for (const item of items) {
      const prodResult = await client.query(
        'SELECT id, name, sku, price, wholesale_price, quantity FROM products WHERE id=$1 AND is_active=true FOR UPDATE',
        [item.product_id]
      );
      if (!prodResult.rows.length) throw new Error(`Product not found: ${item.product_id}`);
      const product = prodResult.rows[0];
      if (product.quantity < item.quantity) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.quantity}`);
      }

      const catResult = await client.query(
        'SELECT c.name FROM categories c JOIN products p ON p.category_id = c.id WHERE p.id=$1', [product.id]
      );
      const categoryName = catResult.rows[0]?.name || '';

      // Use the price sent from the POS (retail or wholesale); fall back to retail if not provided
      const unitPrice = parseFloat(item.unit_price) > 0 ? parseFloat(item.unit_price) : parseFloat(product.price);
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;
      processedItems.push({ ...product, quantity: item.quantity, unit_price: unitPrice, subtotal: itemSubtotal, category_name: categoryName });
    }

    const discountAmount = parseFloat(discount) || 0;
    const tax = 0; // No tax for now — configurable
    const total = Math.max(0, subtotal - discountAmount + tax);
    const amountPaid = parseFloat(amount_paid) || total;
    const changeGiven = Math.max(0, amountPaid - total);
    const receiptNumber = generateReceiptNumber();

    // Create sale
    const saleResult = await client.query(`
      INSERT INTO sales (receipt_number, customer_name, customer_phone, processed_by, subtotal, discount, tax, total, amount_paid, change_given, payment_method, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [receiptNumber, customer_name || 'Walk-in Customer', customer_phone, req.user.id, subtotal, discountAmount, tax, total, amountPaid, changeGiven, payment_method, notes]);

    const sale = saleResult.rows[0];

    // Insert items & deduct stock
    for (const item of processedItems) {
      await client.query(`
        INSERT INTO sale_items (sale_id, product_id, product_name, product_sku, category_name, quantity, unit_price, subtotal)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [sale.id, item.id, item.name, item.sku, item.category_name, item.quantity, item.unit_price, item.subtotal]);

      const newQty = item.quantity - item.quantity;
      await client.query('UPDATE products SET quantity = quantity - $1, updated_at=NOW() WHERE id=$2', [item.quantity, item.id]);
      await client.query(`
        INSERT INTO stock_adjustments (product_id, adjusted_by, previous_qty, new_qty, adjustment, reason, type)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [item.id, req.user.id, item.quantity + item.quantity, item.quantity, -item.quantity, `Sale ${receiptNumber}`, 'sale']);
    }

    await client.query('COMMIT');

    // Return full sale with items
    const fullSale = await client.query(`
      SELECT s.*, u.name as processed_by_name FROM sales s LEFT JOIN users u ON s.processed_by = u.id WHERE s.id=$1
    `, [sale.id]);
    const saleItems = await client.query('SELECT * FROM sale_items WHERE sale_id=$1', [sale.id]);

    logAudit(req.user.id, req.user.name, 'SALE_CREATED', 'sale', sale.id, { receipt: receiptNumber, total }, req.ip);
    res.status(201).json({ sale: fullSale.rows[0], items: saleItems.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Sale processing failed' });
  } finally {
    client.release();
  }
};

const getSales = async (req, res) => {
  try {
    const { startDate, endDate, limit = 50, page = 1 } = req.query;
    let conditions = [];
    let params = [];
    let idx = 1;

    if (startDate) { conditions.push(`s.created_at >= $${idx++}`); params.push(startDate); }
    if (endDate) { conditions.push(`s.created_at <= $${idx++}`); params.push(endDate + 'T23:59:59'); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await pool.query(`
      SELECT s.*, u.name as processed_by_name
      FROM sales s LEFT JOIN users u ON s.processed_by = u.id
      ${where} ORDER BY s.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, limit, offset]);

    const countResult = await pool.query(`SELECT COUNT(*) FROM sales s ${where}`, params);

    res.json({
      sales: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const getSale = async (req, res) => {
  try {
    const saleResult = await pool.query(`
      SELECT s.*, u.name as processed_by_name
      FROM sales s LEFT JOIN users u ON s.processed_by = u.id
      WHERE s.receipt_number = $1 OR s.id::text = $1
    `, [req.params.id]);
    if (!saleResult.rows.length) return res.status(404).json({ error: 'Sale not found' });
    const items = await pool.query('SELECT * FROM sale_items WHERE sale_id=$1', [saleResult.rows[0].id]);
    res.json({ sale: saleResult.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { processSale, getSales, getSale };
