const pool = require('../utils/db');
const { logAudit } = require('./auditController');

const getCategories = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await pool.query(
      'INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING *',
      [name, description]
    );
    logAudit(req.user.id, req.user.name, 'CATEGORY_CREATED', 'category', result.rows[0].id, { name }, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Category already exists' });
    res.status(500).json({ error: 'Server error' });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'UPDATE categories SET name=COALESCE($1,name), description=COALESCE($2,description) WHERE id=$3 RETURNING *',
      [name, description, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Category not found' });
    logAudit(req.user.id, req.user.name, 'CATEGORY_UPDATED', 'category', req.params.id, { name }, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getCategories, createCategory, updateCategory };
