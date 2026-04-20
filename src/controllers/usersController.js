const bcrypt = require('bcryptjs');
const pool = require('../utils/db');
const { logAudit } = require('./auditController');

const getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, is_active, avatar_url, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields required' });
    const validRoles = ['admin', 'manager', 'sales_rep'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, is_active, created_at`,
      [name, email.toLowerCase().trim(), hash, role]
    );
    logAudit(req.user.id, req.user.name, 'USER_CREATED', 'user', result.rows[0].id, { name, email, role }, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Server error' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, is_active } = req.body;
    const result = await pool.query(
      `UPDATE users SET name=COALESCE($1,name), email=COALESCE($2,email),
       role=COALESCE($3,role), is_active=COALESCE($4,is_active), updated_at=NOW()
       WHERE id=$5 RETURNING id, name, email, role, is_active`,
      [name, email, role, is_active, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    logAudit(req.user.id, req.user.name, 'USER_UPDATED', 'user', id, { name, role, is_active }, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, id]);
    logAudit(req.user.id, req.user.name, 'USER_PASSWORD_RESET', 'user', id, null, req.ip);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await pool.query('UPDATE users SET is_active=false WHERE id=$1', [id]);
    logAudit(req.user.id, req.user.name, 'USER_DEACTIVATED', 'user', id, null, req.ip);
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getUsers, createUser, updateUser, resetUserPassword, deleteUser };
