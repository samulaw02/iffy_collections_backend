const pool = require('../utils/db');

pool.query(`
  CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).then(() => pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_phone_unique') THEN
      ALTER TABLE customers ADD CONSTRAINT customers_phone_unique UNIQUE (phone);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_email_unique') THEN
      ALTER TABLE customers ADD CONSTRAINT customers_email_unique UNIQUE (email);
    END IF;
  END $$;
`)).catch(console.error);

const getCustomers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let conditions = [];
    let params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(c.name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRow, purchaseRow] = await Promise.all([
      pool.query(`
        SELECT c.*,
          COUNT(DISTINCT s.id) as total_purchases,
          COALESCE(SUM(s.total), 0) as total_spent
        FROM customers c
        LEFT JOIN sales s ON s.customer_phone = c.phone AND s.customer_name = c.name
        ${where}
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM customers c ${where}`, params),
      Promise.resolve(null),
    ]);

    res.json({
      customers: rows.rows,
      total: parseInt(countRow.rows[0].count),
      totalPages: Math.ceil(parseInt(countRow.rows[0].count) / parseInt(limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getCustomer = async (req, res) => {
  try {
    const [customer, sales] = await Promise.all([
      pool.query('SELECT * FROM customers WHERE id=$1', [req.params.id]),
      pool.query(`
        SELECT s.id, s.receipt_number, s.total, s.payment_method, s.created_at
        FROM sales s
        JOIN customers c ON s.customer_phone = c.phone AND s.customer_name = c.name
        WHERE c.id = $1
        ORDER BY s.created_at DESC LIMIT 20
      `, [req.params.id]),
    ]);
    if (!customer.rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json({ customer: customer.rows[0], sales: sales.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const createCustomer = async (req, res) => {
  try {
    const { name, address, notes } = req.body;
    const phone = req.body.phone || null;
    const email = req.body.email || null;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await pool.query(
      `INSERT INTO customers (name, phone, email, address, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, phone, email, address, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint === 'customers_phone_unique') return res.status(400).json({ error: 'A customer with this phone number already exists' });
      if (err.constraint === 'customers_email_unique') return res.status(400).json({ error: 'A customer with this email already exists' });
      return res.status(400).json({ error: 'Customer already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const { name, address, notes } = req.body;
    const phone = req.body.phone || null;
    const email = req.body.email || null;
    const result = await pool.query(
      `UPDATE customers SET name=$1, phone=$2, email=$3, address=$4, notes=$5, updated_at=NOW() WHERE id=$6 RETURNING *`,
      [name, phone, email, address, notes, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint === 'customers_phone_unique') return res.status(400).json({ error: 'A customer with this phone number already exists' });
      if (err.constraint === 'customers_email_unique') return res.status(400).json({ error: 'A customer with this email already exists' });
      return res.status(400).json({ error: 'Duplicate value' });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    await pool.query('DELETE FROM customers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer };
