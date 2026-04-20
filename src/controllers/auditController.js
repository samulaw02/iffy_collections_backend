const pool = require('../utils/db');

pool.query(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    user_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(console.error);

const logAudit = async (userId, userName, action, entityType, entityId, details, ip) => {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, userName, action, entityType, entityId || null, details ? JSON.stringify(details) : null, ip || null]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

const getAuditLog = async (req, res) => {
  try {
    const { page = 1, limit = 30, action, userId, startDate, endDate } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let conditions = [];
    let params = [];
    let idx = 1;

    if (action) { conditions.push(`a.action ILIKE $${idx++}`); params.push(`%${action}%`); }
    if (userId) { conditions.push(`a.user_id = $${idx++}`); params.push(userId); }
    if (startDate) { conditions.push(`a.created_at >= $${idx++}`); params.push(startDate); }
    if (endDate) { conditions.push(`a.created_at <= $${idx++}::date + INTERVAL '1 day'`); params.push(endDate); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRow] = await Promise.all([
      pool.query(`
        SELECT a.* FROM audit_log a
        ${where}
        ORDER BY a.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM audit_log a ${where}`, params),
    ]);

    res.json({
      logs: rows.rows,
      total: parseInt(countRow.rows[0].count),
      totalPages: Math.ceil(parseInt(countRow.rows[0].count) / parseInt(limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { logAudit, getAuditLog };
