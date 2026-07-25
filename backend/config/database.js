const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);

        console.log(`MongoDB Connected: ${conn.connection.host}`);
        
        // Create admin user if doesn't exist
        await createAdminUser();

        // Backfill slugs for any book/course saved before the slug field
        // existed, so every catalog item gets a name-based URL automatically.
        const { backfillSlugs } = require('../utils/backfillSlugs');
        await backfillSlugs({ verbose: true });
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const createAdminUser = async () => {
    const User = require('../models/User');
    
    const adminExists = await User.findOne({ email: process.env.ADMIN_EMAIL });
    
    if (!adminExists) {
        await User.create({
            email: process.env.ADMIN_EMAIL,
            password: process.env.ADMIN_PASSWORD,
            fullName: 'Admin User',
            mobileNumber: '9999999999',
            isAdmin: true
        });
        console.log('Admin user created');
    }
};

module.exports = connectDB;