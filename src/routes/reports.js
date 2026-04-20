const router = require('express').Router();
const { getCashSummary, getProfitReport } = require('../controllers/reportsController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.get('/cash-summary', authenticate, adminOnly, getCashSummary);
router.get('/profit', authenticate, adminOnly, getProfitReport);

module.exports = router;
