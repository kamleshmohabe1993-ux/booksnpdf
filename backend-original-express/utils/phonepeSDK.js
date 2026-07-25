// const axios = require('axios');
// const crypto = require('crypto');

// class PhonePeSDK {
//     constructor(config) {
//         this.merchantId = config.merchantId;
//         this.saltKey = config.saltKey;
//         this.saltIndex = config.saltIndex;
//         this.env = config.env;
//         console.log("config.merchantId", config);
//         // Set base URL based on environment
//         this.baseUrl = this.env === 'PRODUCTION' 
//             ? 'https://api.phonepe.com/apis/hermes'
//             : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
        
//         console.log('✅ PhonePeSDK initialized');
//         console.log('📱 Base URL:', this.baseUrl);
//         console.log('🏪 Merchant ID:', this.merchantId);
//     }

//     /**
//      * Generate checksum for request
//      */
//     generateChecksum(payload, endpoint) {
//         const stringToHash = payload + endpoint + this.saltKey;
//         const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
//         return sha256Hash + '###' + this.saltIndex;
//     }

//     /**
//      * Verify checksum from PhonePe response
//      */
//     verifyChecksum(response, checksum) {
//         const stringToHash = response + '/pg/v1/status/' + this.merchantId + '/' + this.saltKey;
//         const calculatedChecksum = crypto.createHash('sha256').update(stringToHash).digest('hex') + '###' + this.saltIndex;
//         return calculatedChecksum === checksum;
//     }

//     /**
//      * Initiate payment - CORRECT FUNCTION NAME
//      */
//     async initiatePayment(paymentData) {
//         try {
//             console.log('💳 Initiating payment with data:', paymentData);

//             const payload = {
//                 merchantId: this.merchantId,
//                 merchantTransactionId: paymentData.transactionId,
//                 merchantUserId: paymentData.userId,
//                 amount: paymentData.amount, // Amount in paise
//                 redirectUrl: paymentData.redirectUrl,
//                 redirectMode: paymentData.redirectMode || 'POST',
//                 callbackUrl: paymentData.callbackUrl,
//                 mobileNumber: paymentData.mobileNumber || null,
//                 paymentInstrument: {
//                     type: 'PAY_PAGE'
//                 }
//             };

//             console.log('📦 Payment payload:', JSON.stringify(payload, null, 2));

//             // Encode payload to base64
//             const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
//             console.log('🔐 Base64 Payload:', base64Payload.substring(0, 50) + '...');
            
//             const apiEndpoint = "/pg/v1/pay";
//             // Generate checksum
//             const checksum = this.generateChecksum(
//                 base64Payload, 
//                 apiEndpoint, 
//                 process.env.PHONEPE_SALT_KEY,
//                 process.env.PHONEPE_SALT_INDEX);
//             console.log('✅ Checksum generated:', checksum, "..................");

//             // Make API request
//             const response = await axios.post(
//                 `${this.baseUrl}`+ apiEndpoint,
//                 {
//                     request: base64Payload
//                 },
//                 {
//                     headers: {
//                         'Content-Type': 'application/json',
//                         'X-VERIFY': checksum
//                     }
//                 }
//             );

//             console.log('✅ PhonePe Response:', response.data);

//             return {
//                 success: response.data.success,
//                 code: response.data.code,
//                 message: response.data.message,
//                 data: response.data.data
//             };

//         } catch (error) {
//             console.error('❌ PhonePe Payment Error:', error.response?.data || error.message);
//             throw new Error(error.response?.data?.message || 'Payment initiation failed');
//         }
//     }

//     /**
//      * Check payment status
//      */
//     async checkStatus(transactionId) {
//         try {
//             console.log('🔍 Checking status for transaction:', transactionId);

//             const endpoint = `/pg/v1/status/${this.merchantId}/${transactionId}`;
//             const checksum = this.generateChecksum('', endpoint);

//             const response = await axios.get(
//                 `${this.baseUrl}${endpoint}`,
//                 {
//                     headers: {
//                         'Content-Type': 'application/json',
//                         'X-VERIFY': checksum,
//                         'X-MERCHANT-ID': this.merchantId
//                     }
//                 }
//             );

//             console.log('✅ Status Response:', response.data);

//             return {
//                 success: response.data.success,
//                 code: response.data.code,
//                 message: response.data.message,
//                 data: response.data.data
//             };

//         } catch (error) {
//             console.error('❌ PhonePe Status Check Error:', error.response?.data || error.message);
//             throw new Error(error.response?.data?.message || 'Status check failed');
//         }
//     }

//     /**
//      * Initiate refund
//      */
//     async initiateRefund(refundData) {
//         try {
//             console.log('💸 Initiating refund:', refundData);

//             const payload = {
//                 merchantId: this.merchantId,
//                 merchantUserId: refundData.userId,
//                 originalTransactionId: refundData.originalTransactionId,
//                 merchantTransactionId: refundData.refundTransactionId,
//                 amount: refundData.amount, // Amount in paise
//                 callbackUrl: refundData.callbackUrl
//             };

//             // Encode payload to base64
//             const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
            
//             // Generate checksum
//             const checksum = this.generateChecksum(base64Payload, '/pg/v1/refund');

//             // Make API request
//             const response = await axios.post(
//                 `${this.baseUrl}/pg/v1/refund`,
//                 {
//                     request: base64Payload
//                 },
//                 {
//                     headers: {
//                         'Content-Type': 'application/json',
//                         'X-VERIFY': checksum
//                     }
//                 }
//             );

//             console.log('✅ Refund Response:', response.data);

//             return {
//                 success: response.data.success,
//                 code: response.data.code,
//                 message: response.data.message,
//                 data: response.data.data
//             };

//         } catch (error) {
//             console.error('❌ PhonePe Refund Error:', error.response?.data || error.message);
//             throw new Error(error.response?.data?.message || 'Refund initiation failed');
//         }
//     }

//     /**
//      * Verify webhook callback
//      */
//     verifyWebhook(base64Response, xVerifyHeader) {
//         try {
//             console.log('🔐 Verifying webhook...');

//             // Decode response
//             const decodedResponse = JSON.parse(
//                 Buffer.from(base64Response, 'base64').toString('utf-8')
//             );

//             console.log('📦 Decoded webhook data:', decodedResponse);

//             const { transactionId } = decodedResponse.data || {};

//             if (!transactionId) {
//                 console.error('❌ No transaction ID in webhook');
//                 return { valid: false, error: 'Invalid transaction data' };
//             }

//             // Verify checksum
//             const checksumString = base64Response + '/pg/v1/status/' + this.merchantId + '/' + transactionId + this.saltKey;
//             const calculatedChecksum = crypto.createHash('sha256')
//                 .update(checksumString)
//                 .digest('hex') + '###' + this.saltIndex;

//             console.log('🔐 Calculated checksum:', calculatedChecksum);
//             console.log('🔐 Received checksum:', xVerifyHeader);

//             if (xVerifyHeader !== calculatedChecksum) {
//                 console.error('❌ Checksum mismatch');
//                 return { valid: false, error: 'Checksum verification failed' };
//             }

//             console.log('✅ Webhook verified successfully');

//             return {
//                 valid: true,
//                 data: decodedResponse
//             };

//         } catch (error) {
//             console.error('❌ Webhook verification error:', error);
//             return { valid: false, error: error.message };
//         }
//     }
// }

// module.exports = PhonePeSDK;


const axios = require('axios');
const crypto = require('crypto');
class PhonePeV2SDK {
    constructor(config) {
        this.validateConfig(config);
        
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.clientVersion = config.clientVersion || '1';
        this.env = config.env || 'SANDBOX';
        
        // V2 API Base URLs
        if (this.env === 'PRODUCTION') {
            this.authBaseUrl = 'https://api.phonepe.com/apis/identity-manager';
            this.apiBaseUrl = 'https://api.phonepe.com/apis/pg';
        } else {
            this.authBaseUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
            this.apiBaseUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
        }
        
        this.verbose = config.verbose !== false && this.env !== 'PRODUCTION';
        this.timeout = config.timeout || 30000;
        
        // Token cache
        this.accessToken = null;
        this.tokenExpiry = null;
        
        this.log('info', '✅ PhonePe V2 SDK initialized', {
            environment: this.env,
            authUrl: this.authBaseUrl,
            apiUrl: this.apiBaseUrl
        });
    }

    validateConfig(config) {
        const required = ['clientId', 'clientSecret', 'env'];
        const missing = required.filter(key => !config[key]);
        if (missing.length > 0) {
            throw new Error(`Missing PhonePe V2 config: ${missing.join(', ')}`);
        }
    }

    log(level, message, data = null) {
        if (!this.verbose && level === 'debug') return;
        const emoji = { 
            info: 'ℹ️', 
            success: '✅', 
            error: '❌', 
            warning: '⚠️', 
            debug: '🔍' 
        };
        console.log(`${emoji[level] || '📝'} [${new Date().toISOString()}] ${message}`, 
                    data ? JSON.stringify(data, null, 2) : '');
    }

    /**
     * V2: Generate OAuth 2.0 Access Token
     */
    async getAccessToken(forceRefresh = false) {
        try {
            // Return cached token if valid
            if (!forceRefresh && this.accessToken && this.tokenExpiry) {
                const now = Date.now();
                if (now < this.tokenExpiry - 60000) { // 1 min buffer
                    this.log('debug', '🔑 Using cached access token');
                    return this.accessToken;
                }
            }

            this.log('info', '🔑 Generating new access token');

            const response = await axios.post(
                `${this.authBaseUrl}/v1/oauth/token`,
                new URLSearchParams({
                    client_id: this.clientId,
                    client_version: this.clientVersion,
                    client_secret: this.clientSecret,
                    grant_type: 'client_credentials'
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: this.timeout
                }
            );

            if (response.data && response.data.access_token) {
                this.accessToken = response.data.access_token;
                
                // Calculate expiry (typically 30 minutes)
                const expiresIn = response.data.expires_in || 1800; // default 30 min
                this.tokenExpiry = Date.now() + (expiresIn * 1000);
                
                this.log('success', '✅ Access token generated', {
                    expiresIn: `${expiresIn}s`,
                    tokenPrefix: this.accessToken.substring(0, 20) + '...'
                });

                return this.accessToken;
            } else {
                throw new Error('Invalid token response');
            }

        } catch (error) {
            this.log('error', '❌ Token generation failed', {
                error: error.message,
                response: error.response?.data
            });
            const phonePeMsg = error.response?.data?.message;
            const phonePeCode = error.response?.data?.code;
            const httpStatus = error.response?.status;
            throw new Error(
                phonePeMsg ||
                (phonePeCode && httpStatus
                    ? `PhonePe rejected the credentials (HTTP ${httpStatus}, code: ${phonePeCode}). Check that PHONEPE_CLIENT_ID/PHONEPE_CLIENT_SECRET/PHONEPE_CLIENT_VERSION match each other and match the environment (sandbox vs production) you're targeting.`
                    : 'Failed to generate access token')
            );
        }
    }

    /**
     * V2: Create Payment (Standard Checkout)
     */
    async createPayment(paymentData) {
        try {
            this.log('info', '💳 Creating PhonePe V2 payment', {
                merchantOrderId: paymentData.merchantOrderId,
                amount: paymentData.amount
            });

            // Validate payment data
            this.validatePaymentData(paymentData);

            // Get access token
            const token = await this.getAccessToken();

            // V2 Payload Structure
            const payload = {
                merchantOrderId: paymentData.merchantOrderId,
                amount: paymentData.amount, // Amount in paise
                expireAfter: paymentData.expireAfter || 1800, // 30 minutes default
                paymentFlow: {
                    type: 'PG_CHECKOUT',
                    message: paymentData.message || 'Payment for order',
                    merchantUrls: {
                        redirectUrl: paymentData.redirectUrl
                    }
                }
            };

            // Optional: Add metadata
            if (paymentData.metaInfo) {
                payload.metaInfo = paymentData.metaInfo;
            }

            // Optional: Payment mode configuration
            if (paymentData.paymentModeConfig) {
                payload.paymentModeConfig = paymentData.paymentModeConfig;
            }

            this.log('debug', '📦 Payment payload', payload);

            // V2 API Call
            const response = await axios.post(
                `${this.apiBaseUrl}/checkout/v2/pay`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `O-Bearer ${token}` // V2 uses O-Bearer prefix
                    },
                    timeout: this.timeout
                }
            );

            this.log('success', '✅ Payment created', {
                orderId: response.data.orderId,
                state: response.data.state
            });

            return {
                success: true,
                orderId: response.data.orderId,
                state: response.data.state,
                redirectUrl: response.data.redirectUrl,
                expireAt: response.data.expireAt,
                merchantOrderId: paymentData.merchantOrderId
            };

        } catch (error) {
            this.log('error', '❌ Payment creation failed', {
                error: error.message,
                response: error.response?.data
            });
            
            throw new Error(
                error.response?.data?.message || 
                error.message || 
                'Payment creation failed'
            );
        }
    }

    /**
     * V2: Check Order Status
     */
    async checkOrderStatus(merchantOrderId) {
        try {
            this.log('info', '🔍 Checking order status', { merchantOrderId });

            // Get access token
            const token = await this.getAccessToken();

            const response = await axios.get(
                `${this.apiBaseUrl}/checkout/v2/order/${merchantOrderId}/status`,
                {
                    headers: {
                        'Authorization': `O-Bearer ${token}`
                    },
                    timeout: this.timeout
                }
            );

            const data = response.data;
            
            const status = {
                success: true,
                merchantOrderId: merchantOrderId,
                orderId: data.orderId,
                state: data.state,
                amount: data.amount,
                paymentStatus: this.mapOrderState(data.state),
                createdAt: data.createdAt,
                completedAt: data.completedAt,
                paymentInstrument: data.paymentInstrument
            };

            this.log('success', '✅ Status retrieved', {
                state: status.state,
                paymentStatus: status.paymentStatus
            });

            return status;

        } catch (error) {
            this.log('error', '❌ Status check failed', {
                error: error.message,
                response: error.response?.data
            });
            
            throw new Error(
                error.response?.data?.message || 
                'Status check failed'
            );
        }
    }

    /**
     * V2: Initiate Refund
     */
    async initiateRefund(refundData) {
        try {
            this.log('info', '💸 Initiating refund', {
                merchantRefundId: refundData.merchantRefundId,
                amount: refundData.amount
            });

            // Get access token
            const token = await this.getAccessToken();

            const payload = {
                merchantRefundId: refundData.merchantRefundId,
                originalOrderId: refundData.originalOrderId,
                amount: refundData.amount, // Amount in paise
                reason: refundData.reason || 'Customer requested refund'
            };

            const response = await axios.post(
                `${this.apiBaseUrl}/payments/v2/refund`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `O-Bearer ${token}`
                    },
                    timeout: this.timeout
                }
            );

            this.log('success', '✅ Refund initiated', {
                refundId: response.data.refundId,
                state: response.data.state
            });

            return {
                success: true,
                refundId: response.data.refundId,
                state: response.data.state,
                merchantRefundId: refundData.merchantRefundId
            };

        } catch (error) {
            this.log('error', '❌ Refund failed', {
                error: error.message,
                response: error.response?.data
            });
            
            throw new Error(
                error.response?.data?.message || 
                'Refund initiation failed'
            );
        }
    }

    /**
     * V2: Check Refund Status
     */
    async checkRefundStatus(merchantRefundId) {
        try {
            this.log('info', '🔍 Checking refund status', { merchantRefundId });

            const token = await this.getAccessToken();

            const response = await axios.get(
                `${this.apiBaseUrl}/payments/v2/refund/${merchantRefundId}/status`,
                {
                    headers: {
                        'Authorization': `O-Bearer ${token}`
                    },
                    timeout: this.timeout
                }
            );

            return {
                success: true,
                ...response.data
            };

        } catch (error) {
            this.log('error', '❌ Refund status check failed', {
                error: error.message
            });
            
            throw new Error('Refund status check failed');
        }
    }

    /**
     * Validate payment data
     */
    validatePaymentData(data) {
        const required = ['merchantOrderId', 'amount', 'redirectUrl'];
        const missing = required.filter(key => !data[key]);

        if (missing.length > 0) {
            throw new Error(`Missing payment fields: ${missing.join(', ')}`);
        }

        if (typeof data.amount !== 'number' || data.amount <= 0) {
            throw new Error('Amount must be a positive number in paise');
        }

        if (data.amount < 100) {
            throw new Error('Minimum payment amount is ₹1 (100 paise)');
        }
    }

    /**
     * Map PhonePe order state to simplified status
     */
    mapOrderState(state) {
        const stateMap = {
            'PENDING': 'PENDING',
            'COMPLETED': 'SUCCESS',
            'FAILED': 'FAILED',
            'EXPIRED': 'FAILED',
            'CANCELLED': 'FAILED'
        };
        return stateMap[state] || 'UNKNOWN';
    }

    /**
     * Utility: Convert rupees to paise
     */
    static rupeesToPaise(rupees) {
        return Math.round(rupees * 100);
    }

    /**
     * Utility: Convert paise to rupees
     */
    static paiseToRupees(paise) {
        return paise / 100;
    }

    /**
     * Utility: Format amount
     */
    static formatAmount(paise) {
        return `₹${(paise / 100).toFixed(2)}`;
    }
}

module.exports = PhonePeV2SDK;
