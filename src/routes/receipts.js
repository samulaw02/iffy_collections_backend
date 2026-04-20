const router = require('express').Router();
const { generateReceiptPDF } = require('../controllers/receiptsController');
const { authenticate } = require('../middleware/auth');

router.get('/:id/pdf', authenticate, generateReceiptPDF);

module.exports = router;
