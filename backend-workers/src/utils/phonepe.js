// src/utils/phonepe.js
//
// Port of the original utils/phonepeSDK.js `PhonePeV2SDK` class. The
// original already used axios purely for plain HTTPS calls with an OAuth
// bearer token (no Node-specific checksum/crypto in the active V2 code
// path), so this is a straightforward swap to `fetch`.

export class PhonePeV2Client {
  constructor(env) {
    this.clientId = env.PHONEPE_CLIENT_ID;
    this.clientSecret = env.PHONEPE_CLIENT_SECRET;
    this.clientVersion = env.PHONEPE_CLIENT_VERSION || '1';
    this.envMode = env.NODE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX';
    this.verbose = env.NODE_ENV !== 'production';

    if (this.envMode === 'PRODUCTION') {
      this.authBaseUrl = 'https://api.phonepe.com/apis/identity-manager';
      this.apiBaseUrl = 'https://api.phonepe.com/apis/pg';
    } else {
      this.authBaseUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
      this.apiBaseUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Missing PhonePe config: PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET');
    }
  }

  log(level, message, data) {
    if (!this.verbose && level === 'debug') return;
    const emoji = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', debug: '🔍' };
    console.log(`${emoji[level] || '📝'} [${new Date().toISOString()}] ${message}`, data ?? '');
  }

  // Token is cached on globalThis so it survives across requests handled by
  // the same Worker isolate (mirrors the original in-memory instance cache
  // — both are lost on a cold start / new instance, which is fine since a
  // fresh token is cheap to fetch).
  async getAccessToken(forceRefresh = false) {
    const cache = (globalThis.__phonepeTokenCache ??= {});
    if (!forceRefresh && cache.token && cache.expiry && Date.now() < cache.expiry - 60_000) {
      return cache.token;
    }

    const res = await fetch(`${this.authBaseUrl}/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_version: this.clientVersion,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.access_token) {
      this.log('error', 'Token generation failed', data);
      throw new Error(
        data.message ||
          (data.code ? `PhonePe rejected the credentials (HTTP ${res.status}, code: ${data.code}). Check PHONEPE_CLIENT_ID/SECRET/VERSION match the environment.` : 'Failed to generate access token')
      );
    }

    cache.token = data.access_token;
    cache.expiry = Date.now() + (data.expires_in || 1800) * 1000;
    return cache.token;
  }

  validatePaymentData(data) {
    const required = ['merchantOrderId', 'amount', 'redirectUrl'];
    const missing = required.filter((key) => !data[key]);
    if (missing.length > 0) throw new Error(`Missing payment fields: ${missing.join(', ')}`);
    if (typeof data.amount !== 'number' || data.amount <= 0) throw new Error('Amount must be a positive number in paise');
    if (data.amount < 100) throw new Error('Minimum payment amount is ₹1 (100 paise)');
  }

  async createPayment(paymentData) {
    this.validatePaymentData(paymentData);
    const token = await this.getAccessToken();

    const payload = {
      merchantOrderId: paymentData.merchantOrderId,
      amount: paymentData.amount,
      expireAfter: paymentData.expireAfter || 1800,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: paymentData.message || 'Payment for order',
        merchantUrls: { redirectUrl: paymentData.redirectUrl },
      },
    };
    if (paymentData.metaInfo) payload.metaInfo = paymentData.metaInfo;
    if (paymentData.paymentModeConfig) payload.paymentModeConfig = paymentData.paymentModeConfig;

    const res = await fetch(`${this.apiBaseUrl}/checkout/v2/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `O-Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      this.log('error', 'Payment creation failed', data);
      throw new Error(data.message || 'Payment creation failed');
    }

    return {
      success: true,
      orderId: data.orderId,
      state: data.state,
      redirectUrl: data.redirectUrl,
      expireAt: data.expireAt,
      merchantOrderId: paymentData.merchantOrderId,
    };
  }

  mapOrderState(state) {
    const stateMap = { PENDING: 'PENDING', COMPLETED: 'SUCCESS', FAILED: 'FAILED', EXPIRED: 'FAILED', CANCELLED: 'FAILED' };
    return stateMap[state] || 'UNKNOWN';
  }

  async checkOrderStatus(merchantOrderId) {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.apiBaseUrl}/checkout/v2/order/${merchantOrderId}/status`, {
      headers: { Authorization: `O-Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.log('error', 'Status check failed', data);
      throw new Error(data.message || 'Status check failed');
    }
    return {
      success: true,
      merchantOrderId,
      orderId: data.orderId,
      state: data.state,
      amount: data.amount,
      paymentStatus: this.mapOrderState(data.state),
      createdAt: data.createdAt,
      completedAt: data.completedAt,
      paymentInstrument: data.paymentInstrument,
    };
  }

  async initiateRefund(refundData) {
    const token = await this.getAccessToken();
    const payload = {
      merchantRefundId: refundData.merchantRefundId,
      originalOrderId: refundData.originalOrderId,
      amount: refundData.amount,
      reason: refundData.reason || 'Customer requested refund',
    };
    const res = await fetch(`${this.apiBaseUrl}/payments/v2/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `O-Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.log('error', 'Refund failed', data);
      throw new Error(data.message || 'Refund initiation failed');
    }
    return { success: true, refundId: data.refundId, state: data.state, merchantRefundId: refundData.merchantRefundId };
  }

  static rupeesToPaise(rupees) {
    return Math.round(rupees * 100);
  }
  static paiseToRupees(paise) {
    return paise / 100;
  }
}

export function verifyPhonePeConfig(env) {
  if (!env.PHONEPE_CLIENT_ID || !env.PHONEPE_CLIENT_SECRET) {
    console.error('❌ PhonePe not configured');
    return false;
  }
  return true;
}
