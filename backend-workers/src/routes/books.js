// src/routes/books.js — port of routes/books.js + controllers/bookController.js
import { createCatalogRouter } from './catalogFactory.js';

const books = createCatalogRouter('books', 'Book');

export default books;
