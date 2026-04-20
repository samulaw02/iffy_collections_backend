const router = require('express').Router();
const { adjustStock, getStockHistory } = require('../controllers/stockController');
const { authenticate, managerOrAdmin } = require('../middleware/auth');

router.post('/adjust', authenticate, managerOrAdmin, adjustStock);
router.get('/history', authenticate, getStockHistory);

module.exports = router;
