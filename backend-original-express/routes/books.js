const express = require('express');
const router = express.Router();
const {
    getAllBooks,
    getBook,
    getBookThumbnail,
    createBook,
    updateBook,
    deleteBook,
    getCategories,
    getAllBooksAdmin
} = require('../controllers/bookController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', getAllBooks);
router.get('/categories', getCategories);
router.get('/admin/all', protect, adminOnly, getAllBooksAdmin);
router.get('/:id/thumbnail', getBookThumbnail);
router.get('/:id', getBook);
router.post('/', protect, adminOnly, createBook);
router.put('/:id', protect, adminOnly, updateBook);
router.delete('/:id', protect, adminOnly, deleteBook);

module.exports = router;