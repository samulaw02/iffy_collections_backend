const router = require('express').Router();
const { getReturns, processReturn } = require('../controllers/returnsController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.get('/', authenticate, adminOnly, getReturns);
router.post('/', authenticate, adminOnly, processReturn);

module.exports = router;
