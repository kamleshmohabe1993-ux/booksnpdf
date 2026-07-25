const PhonePeV2SDK = require('../utils/phonepeSDK');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();


let phonePeV2Client = null;

try {
    phonePeV2Client = new PhonePeV2SDK({
        clientId: process.env.PHONEPE_CLIENT_ID,
        clientSecret: process.env.PHONEPE_CLIENT_SECRET,
        clientVersion: process.env.PHONEPE_CLIENT_VERSION || '1',
        env: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX',
        verbose: process.env.NODE_ENV !== 'production'
    });

    console.log('✅ PhonePe V2 SDK initialized');
    console.log(`📱 Environment: ${process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX'}`);
    console.log(`🆔 Client ID: ${process.env.PHONEPE_CLIENT_ID}`);

} catch (error) {
    console.error('❌ Failed to initialize PhonePe V2 SDK:', error.message);
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

const verifyPhonePeConfig = () => {
    if (!phonePeV2Client) {
        console.error('❌ PhonePe V2 client not initialized');
        return false;
    }
    console.log('✅ PhonePe V2 configuration verified');
    return true;
};

module.exports = {
    phonePeV2Client,
    verifyPhonePeConfig
};