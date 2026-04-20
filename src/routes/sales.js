const router = require('express').Router();
const { processSale, getSales, getSale } = require('../controllers/salesController');
const { authenticate, allRoles } = require('../middleware/auth');

router.get('/', authenticate, getSales);
router.get('/:id', authenticate, getSale);
router.post('/', authenticate, allRoles, processSale);

module.exports = router;
