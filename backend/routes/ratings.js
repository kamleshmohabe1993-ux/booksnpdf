const express = require('express');
const router = express.Router();
const {
    addRating,
    getBookRatings,
    getUserRating,
    deleteRating
} = require('../controllers/ratingController');
const { protect } = require('../middleware/auth');

router.post('/', protect, addRating);
router.get('/:bookId', getBookRatings);
router.get('/user/:bookId', protect, getUserRating);
router.delete('/:ratingId', protect, deleteRating);

module.exports = router;