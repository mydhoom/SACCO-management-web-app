const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sacco';
        
        // Added the IPv4 override and timeout rules
        const conn = await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000, 
            family: 4 
        });
        
        console.log(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);
    } catch (err) {
        console.error(`❌ Database Connection Error: ${err.message}`);
        
        // CRITICAL FIX: Stop the server immediately if the DB fails to connect
        // This prevents the confusing 500 errors on the frontend!
        process.exit(1);
    }
};

module.exports = connectDB;