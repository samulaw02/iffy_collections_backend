const router = require('express').Router();
const { getAuditLog } = require('../controllers/auditController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.get('/', authenticate, adminOnly, getAuditLog);

module.exports = router;
