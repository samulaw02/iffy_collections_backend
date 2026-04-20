const router = require('express').Router();
const { getUsers, createUser, updateUser, resetUserPassword, deleteUser } = require('../controllers/usersController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate, adminOnly);
router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.put('/:id/reset-password', resetUserPassword);
router.delete('/:id', deleteUser);

module.exports = router;
