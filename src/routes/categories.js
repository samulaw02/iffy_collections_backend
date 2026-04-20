// categories.js
const router1 = require('express').Router();
const cats = require('../controllers/categoriesController');
const { authenticate, adminOnly } = require('../middleware/auth');
router1.get('/', authenticate, cats.getCategories);
router1.post('/', authenticate, adminOnly, cats.createCategory);
router1.put('/:id', authenticate, adminOnly, cats.updateCategory);
module.exports = router1;
