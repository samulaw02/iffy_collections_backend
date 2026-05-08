const multer = require('multer');
const router = require('express').Router();
const { getProducts, getProduct, createProduct, updateProduct, deleteProduct, bulkImportProducts } = require('../controllers/productsController');
const { authenticate, adminOnly } = require('../middleware/auth');
const { uploadFile } = require('../utils/supabaseStorage');
const pool = require('../utils/db');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'));
    cb(null, true);
  },
});

router.get('/', authenticate, getProducts);
router.get('/:id', authenticate, getProduct);
router.post('/', authenticate, adminOnly, createProduct);
router.post('/bulk-import', authenticate, adminOnly, bulkImportProducts);
router.put('/:id', authenticate, adminOnly, updateProduct);
router.delete('/:id', authenticate, adminOnly, deleteProduct);

router.post('/:id/image', authenticate, adminOnly, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const path = `products/${req.params.id}-${Date.now()}.${ext}`;
    const imageUrl = await uploadFile(req.file.buffer, path, req.file.mimetype);
    await pool.query('UPDATE products SET image_url=$1, updated_at=NOW() WHERE id=$2', [imageUrl, req.params.id]);
    res.json({ image_url: imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
