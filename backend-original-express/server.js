const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const { verifyPhonePeConfig } = require('./config/phonepe');
const cookieParser = require('cookie-parser');
// Load env vars
dotenv.config();

// Connect to database
connectDB();

// Verify PhonePe configuration
if (!verifyPhonePeConfig()) {
    console.warn('⚠️  PhonePe configuration incomplete');
}

const app = express();
app.use(cookieParser());
// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/books', require('./routes/books'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/ratings', require('./routes/ratings')); // NEW

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is running',
        phonepe: !!(process.env.PHONEPE_CLIENT_ID && process.env.PHONEPE_CLIENT_SECRET)
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Server Error'
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 PhonePe: ${process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'UAT (Test)'} Mode`);
});