const router = require('express').Router();
const { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer } = require('../controllers/customersController');
const { authenticate, adminOnly, requireRole } = require('../middleware/auth');

router.get('/', authenticate, getCustomers);
router.get('/:id', authenticate, getCustomer);
router.post('/', authenticate, requireRole('admin', 'sales_rep'), createCustomer);
router.put('/:id', authenticate, adminOnly, updateCustomer);
router.delete('/:id', authenticate, adminOnly, deleteCustomer);

module.exports = router;
