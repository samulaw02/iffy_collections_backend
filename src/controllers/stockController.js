const pool = require('../utils/db');
const { logAudit } = require('./auditController');

const adjustStock = async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_id, new_quantity, reason, type = 'manual' } = req.body;
    if (product_id === undefined || new_quantity === undefined) {
      return res.status(400).json({ error: 'product_id and new_quantity required' });
    }
    if (new_quantity < 0) return res.status(400).json({ error: 'Quantity cannot be negative' });

    await client.query('BEGIN');

    const prodResult = await client.query('SELECT quantity FROM products WHERE id=$1 AND is_active=true', [product_id]);
    if (!prodResult.rows.length) return res.status(404).json({ error: 'Product not found' });

    const prevQty = prodResult.rows[0].quantity;
    const adjustment = new_quantity - prevQty;

    await client.query('UPDATE products SET quantity=$1, updated_at=NOW() WHERE id=$2', [new_quantity, product_id]);
    await client.query(`
      INSERT INTO stock_adjustments (product_id, adjusted_by, previous_qty, new_qty, adjustment, reason, type)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [product_id, req.user.id, prevQty, new_quantity, adjustment, reason || 'Manual adjustment', type]);

    await client.query('COMMIT');
    logAudit(req.user.id, req.user.name, 'STOCK_ADJUSTED', 'product', product_id, { prev: prevQty, new: new_quantity, adjustment, reason, type }, req.ip);
    res.json({ message: 'Stock updated', previous: prevQty, new: new_quantity, adjustment });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const getStockHistory = async (req, res) => {
  try {
    const { product_id, limit = 50 } = req.query;
    let query = `
      SELECT sa.*, p.name as product_name, p.sku, u.name as adjusted_by_name
      FROM stock_adjustments sa
      LEFT JOIN products p ON sa.product_id = p.id
      LEFT JOIN users u ON sa.adjusted_by = u.id
    `;
    const params = [];
    if (product_id) { query += ' WHERE sa.product_id = $1'; params.push(product_id); }
    query += ` ORDER BY sa.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { adjustStock, getStockHistory };
