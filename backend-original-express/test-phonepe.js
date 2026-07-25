// Diagnostic script for PhonePe V2 setup — actually calls getAccessToken()
// against your real credentials, so you see the exact error PhonePe
// returns instead of guessing.
//
// Usage:
//   cd backend
//   node test-phonepe.js

require('dotenv').config();
const { phonePeV2Client, verifyPhonePeConfig } = require('./config/phonepe');

console.log('🧪 Testing PhonePe V2 setup...\n');

console.log('📋 Env vars:');
console.log('  NODE_ENV:', process.env.NODE_ENV || '(not set — defaults to SANDBOX)');
console.log('  PHONEPE_CLIENT_ID:', process.env.PHONEPE_CLIENT_ID ? `${process.env.PHONEPE_CLIENT_ID.slice(0, 6)}…` : '❌ MISSING');
console.log('  PHONEPE_CLIENT_SECRET:', process.env.PHONEPE_CLIENT_SECRET ? 'set' : '❌ MISSING');
console.log('  PHONEPE_CLIENT_VERSION:', process.env.PHONEPE_CLIENT_VERSION || '(not set — defaults to "1")');
console.log('  FRONTEND_URL:', process.env.FRONTEND_URL || '❌ MISSING (redirectUrl will be broken)');

if (!verifyPhonePeConfig()) {
    console.log('\n❌ SDK did not initialize — check the env vars above.');
    process.exit(1);
}

async function main() {
    console.log('\n🔑 Requesting access token from PhonePe...');
    try {
        const token = await phonePeV2Client.getAccessToken(true);
        console.log('✅ Token generation works:', token.slice(0, 20) + '…');
    } catch (err) {
        console.error('\n❌ Token generation failed:', err.message);
        console.error(`
Common causes:
  - PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET are wrong, swapped, or for the
    wrong environment (sandbox credentials won't work with NODE_ENV=production
    and vice versa).
  - PHONEPE_CLIENT_VERSION doesn't match what PhonePe issued you (usually "1").
  - Your PhonePe merchant account isn't yet approved/activated for the
    environment you're targeting.
`);
        process.exit(1);
    }

    console.log('\n💳 Testing a dry-run payment create (₹1, throwaway order id)...');
    try {
        const result = await phonePeV2Client.createPayment({
            merchantOrderId: `DIAGNOSTIC${Date.now()}`,
            amount: 100, // ₹1 in paise — PhonePe's minimum
            redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/payment/callback?orderId=test`,
            message: 'Diagnostic test payment',
        });
        console.log('✅ Payment creation works. Checkout URL:', result.redirectUrl);
        console.log('   (This created a real pending order in PhonePe sandbox/production — safe to ignore/let it expire.)');
    } catch (err) {
        console.error('❌ Payment creation failed:', err.message);
        process.exit(1);
    }

    console.log('\n✅ All checks passed — PhonePe is wired up correctly.');
}

main();
