const express = require('express');
const router = express.Router();
const {
    getAllCourses,
    getCourse,
    getCourseThumbnail,
    createCourse,
    updateCourse,
    deleteCourse,
    getCategories,
    getAllCoursesAdmin
} = require('../controllers/courseController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', getAllCourses);
router.get('/categories', getCategories);
router.get('/admin/all', protect, adminOnly, getAllCoursesAdmin);
router.get('/:id/thumbnail', getCourseThumbnail);
router.get('/:id', getCourse);
router.post('/', protect, adminOnly, createCourse);
router.put('/:id', protect, adminOnly, updateCourse);
router.delete('/:id', protect, adminOnly, deleteCourse);

module.exports = router;
