// src/routes/courses.js — port of routes/courses.js + controllers/courseController.js
import { createCatalogRouter } from './catalogFactory.js';

const courses = createCatalogRouter('courses', 'Course');

export default courses;
