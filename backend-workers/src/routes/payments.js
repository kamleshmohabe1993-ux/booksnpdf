// src/routes/payments.js
// Port of routes/payments.js + controllers/paymentController.js.
//
// Note: controllers/transactionsController.js in the original repo was
// never wired into any route (routes/payments.js imports the transaction
// handlers from paymentController.js instead) — it's dead code and is
// intentionally not ported here.

import { Hono } from 'hono';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { PhonePeV2Client } from '../utils/phonepe.js';
import { randomHex, sha256Hex, timingSafeEqualStr } from '../lib/crypto.js';

const payments = new Hono();

function generateOrderId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `TXN${timestamp}${random}`;
}

async function addToLibrary(db, payment) {
  const field = payment.itemType === 'course' ? 'purchasedCourses' : 'purchasedBooks';
  const itemId = payment.itemType === 'course' ? payment.courseId : payment.bookId;
  if (!itemId) return;
  await db.collection('users').updateOne({ _id: payment.userId }, { $addToSet: { [field]: itemId } });
}

async function removeFromLibrary(db, payment) {
  const field = payment.itemType === 'course' ? 'purchasedCourses' : 'purchasedBooks';
  const itemId = payment.itemType === 'course' ? payment.courseId : payment.bookId;
  if (!itemId) return;
  await db.collection('users').updateOne({ _id: payment.userId }, { $pull: { [field]: itemId } });
}

// ── POST /api/payments/initiate (book) ─────────────────────────────────────
payments.post('/initiate', protect, async (c) => {
  try {
    const user = c.get('user');
    const { bookId, upiId } = await c.req.json();
    const db = await getDb(c.env);

    const book = await db.collection('books').findOne({ _id: new ObjectId(bookId) });
    if (!book) return c.json({ success: false, message: 'Book not found' }, 404);
    if (!book.isPaid) return c.json({ success: false, error: 'This book is free to download' }, 400);

    const existingPurchase = await db.collection('payments').findOne({ userId: user._id, bookId: book._id, status: 'SUCCESS' });
    if (existingPurchase) {
      return c.json(
        {
          success: false,
          message: 'You have already purchased this book',
          data: { downloadToken: existingPurchase.downloadToken, transactionId: existingPurchase.merchantOrderId },
        },
        400
      );
    }

    const merchantOrderId = generateOrderId();
    const downloadToken = randomHex(32);
    const amountInPaise = Math.round(book.price * 100);

    const paymentDoc = {
      userId: user._id,
      bookId: book._id,
      itemType: 'book',
      merchantOrderId,
      amount: amountInPaise,
      status: 'INITIATED',
      paymentGateway: 'PhonePe',
      downloadToken,
      maxDownloads: 100,
      userMobile: user.mobileNumber,
      userEmail: user.email,
      upiId: upiId || undefined,
      purchasedAt: new Date(),
      createdAt: new Date(),
    };

    await db.collection('books').updateOne({ _id: book._id }, { $inc: { downloadCount: 1 } });
    const { insertedId } = await db.collection('payments').insertOne(paymentDoc);

    const phonePeClient = new PhonePeV2Client(c.env);
    const paymentData = {
      merchantOrderId,
      amount: amountInPaise,
      redirectUrl: `${c.env.FRONTEND_URL}/payment/callback?orderId=${merchantOrderId}`,
      message: `Payment for ${book.title}`,
      expireAfter: 1800,
      metaInfo: { udf1: user._id.toString(), udf2: book._id.toString(), udf3: book.title, udf4: upiId || '' },
    };
    if (upiId) {
      paymentData.paymentModeConfig = { enabledPaymentModes: [{ type: 'UPI_COLLECT', details: { type: 'VPA', vpa: upiId } }] };
    }

    let phonePeResponse;
    try {
      phonePeResponse = await phonePeClient.createPayment(paymentData);
    } catch (phonePeError) {
      if (upiId && paymentData.paymentModeConfig) {
        try {
          const { paymentModeConfig, ...plain } = paymentData;
          phonePeResponse = await phonePeClient.createPayment(plain);
        } catch (retryError) {
          await db.collection('payments').updateOne({ _id: insertedId }, { $set: { status: 'FAILED', errorMessage: retryError.message } });
          return c.json({ success: false, message: 'Could not reach PhonePe to start payment. Please try again in a moment.', error: retryError.message }, 502);
        }
      } else {
        await db.collection('payments').updateOne({ _id: insertedId }, { $set: { status: 'FAILED', errorMessage: phonePeError.message } });
        return c.json({ success: false, message: 'Could not reach PhonePe to start payment. Please try again in a moment.', error: phonePeError.message }, 502);
      }
    }

    if (!phonePeResponse.success) {
      await db.collection('payments').updateOne({ _id: insertedId }, { $set: { status: 'FAILED', errorMessage: 'Payment creation failed' } });
      return c.json({ success: false, message: 'Failed to initiate payment' }, 400);
    }

    await db.collection('payments').updateOne(
      { _id: insertedId },
      {
        $set: {
          phonePeOrderId: phonePeResponse.orderId,
          status: 'PENDING',
          paymentState: phonePeResponse.state,
          expireAt: new Date(phonePeResponse.expireAt),
          redirectUrl: phonePeResponse.redirectUrl,
        },
      }
    );

    return c.json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        paymentUrl: phonePeResponse.redirectUrl,
        merchantOrderId,
        orderId: phonePeResponse.orderId,
        amount: book.price,
        bookTitle: book.title,
        expireAt: phonePeResponse.expireAt,
      },
    });
  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    return c.json({ success: false, message: 'Failed to initiate payment', error: error.message }, 500);
  }
});

// ── POST /api/payments/initiate-course ─────────────────────────────────────
payments.post('/initiate-course', protect, async (c) => {
  try {
    const user = c.get('user');
    const { courseId, upiId } = await c.req.json();
    const db = await getDb(c.env);

    const course = await db.collection('courses').findOne({ _id: new ObjectId(courseId) });
    if (!course) return c.json({ success: false, message: 'Course not found' }, 404);
    if (!course.isPaid) return c.json({ success: false, error: 'This course is free to download' }, 400);

    const existingPurchase = await db.collection('payments').findOne({ userId: user._id, courseId: course._id, status: 'SUCCESS' });
    if (existingPurchase) {
      return c.json(
        {
          success: false,
          message: 'You have already purchased this course',
          data: { downloadToken: existingPurchase.downloadToken, transactionId: existingPurchase.merchantOrderId },
        },
        400
      );
    }

    const merchantOrderId = generateOrderId();
    const downloadToken = randomHex(32);
    const amountInPaise = Math.round(course.price * 100);

    const paymentDoc = {
      userId: user._id,
      courseId: course._id,
      itemType: 'course',
      merchantOrderId,
      amount: amountInPaise,
      status: 'INITIATED',
      paymentGateway: 'PhonePe',
      downloadToken,
      maxDownloads: 100,
      userMobile: user.mobileNumber,
      userEmail: user.email,
      upiId: upiId || undefined,
      purchasedAt: new Date(),
      createdAt: new Date(),
    };

    await db.collection('courses').updateOne({ _id: course._id }, { $inc: { downloadCount: 1 } });
    const { insertedId } = await db.collection('payments').insertOne(paymentDoc);

    const phonePeClient = new PhonePeV2Client(c.env);
    const paymentData = {
      merchantOrderId,
      amount: amountInPaise,
      redirectUrl: `${c.env.FRONTEND_URL}/payment/callback?orderId=${merchantOrderId}`,
      message: `Payment for ${course.title}`,
      expireAfter: 1800,
      metaInfo: { udf1: user._id.toString(), udf2: course._id.toString(), udf3: course.title, udf4: 'course' },
    };
    if (upiId) {
      paymentData.paymentModeConfig = { enabledPaymentModes: [{ type: 'UPI_COLLECT', details: { type: 'VPA', vpa: upiId } }] };
    }

    let phonePeResponse;
    try {
      phonePeResponse = await phonePeClient.createPayment(paymentData);
    } catch (phonePeError) {
      if (upiId && paymentData.paymentModeConfig) {
        try {
          const { paymentModeConfig, ...plain } = paymentData;
          phonePeResponse = await phonePeClient.createPayment(plain);
        } catch (retryError) {
          await db.collection('payments').updateOne({ _id: insertedId }, { $set: { status: 'FAILED', errorMessage: retryError.message } });
          return c.json({ success: false, message: 'Could not reach PhonePe to start payment. Please try again in a moment.', error: retryError.message }, 502);
        }
      } else {
        await db.collection('payments').updateOne({ _id: insertedId }, { $set: { status: 'FAILED', errorMessage: phonePeError.message } });
        return c.json({ success: false, message: 'Could not reach PhonePe to start payment. Please try again in a moment.', error: phonePeError.message }, 502);
      }
    }

    if (!phonePeResponse.success) {
      await db.collection('payments').updateOne({ _id: insertedId }, { $set: { status: 'FAILED', errorMessage: 'Payment creation failed' } });
      return c.json({ success: false, message: 'Failed to initiate payment' }, 400);
    }

    await db.collection('payments').updateOne(
      { _id: insertedId },
      {
        $set: {
          phonePeOrderId: phonePeResponse.orderId,
          status: 'PENDING',
          paymentState: phonePeResponse.state,
          expireAt: new Date(phonePeResponse.expireAt),
          redirectUrl: phonePeResponse.redirectUrl,
        },
      }
    );

    return c.json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        paymentUrl: phonePeResponse.redirectUrl,
        merchantOrderId,
        orderId: phonePeResponse.orderId,
        amount: course.price,
        courseTitle: course.title,
        expireAt: phonePeResponse.expireAt,
      },
    });
  } catch (error) {
    console.error('❌ Course payment initiation error:', error);
    return c.json({ success: false, message: 'Failed to initiate payment', error: error.message }, 500);
  }
});

// ── GET /api/payments/history ───────────────────────────────────────────────
payments.get('/history', protect, async (c) => {
  try {
    const user = c.get('user');
    const { page = 1, limit = 10, status } = c.req.query();
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    const query = { userId: user._id };
    if (status) query.status = status.toUpperCase();

    const db = await getDb(c.env);
    const list = await db
      .collection('payments')
      .aggregate([
        { $match: query },
        { $lookup: { from: 'books', localField: 'bookId', foreignField: '_id', as: 'bookId' } },
        { $unwind: { path: '$bookId', preserveNullAndEmptyArrays: true } },
        { $sort: { createdAt: -1 } },
        { $skip: (pageNum - 1) * limitNum },
        { $limit: limitNum },
      ])
      .toArray();

    const count = await db.collection('payments').countDocuments(query);

    return c.json({
      success: true,
      data: { payments: list, totalPages: Math.ceil(count / limitNum), currentPage: pageNum, total: count },
    });
  } catch (error) {
    console.error('❌ Get payment history error:', error);
    return c.json({ success: false, message: 'Failed to get payment history', error: error.message }, 500);
  }
});

// ── POST /api/payments/refund/:merchantOrderId (admin) ────────────────────
payments.post('/refund/:merchantOrderId', protect, adminOnly, async (c) => {
  try {
    const merchantOrderId = c.req.param('merchantOrderId');
    const { reason } = await c.req.json().catch(() => ({}));
    const db = await getDb(c.env);

    const payment = await db.collection('payments').findOne({ merchantOrderId });
    if (!payment) return c.json({ success: false, message: 'Payment not found' }, 404);
    if (payment.status !== 'SUCCESS') return c.json({ success: false, message: 'Only successful payments can be refunded' }, 400);

    const daysSince = Math.floor((Date.now() - new Date(payment.completedAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 7) return c.json({ success: false, message: 'Refund period has expired (7 days)' }, 400);

    const merchantRefundId = `REFUND${Date.now()}`;
    const phonePeClient = new PhonePeV2Client(c.env);
    const refundResponse = await phonePeClient.initiateRefund({
      merchantRefundId,
      originalOrderId: payment.phonePeOrderId,
      amount: payment.amount,
      reason: reason || 'Customer requested refund',
    });

    if (!refundResponse.success) {
      return c.json({ success: false, message: 'Refund initiation failed' }, 400);
    }

    await db.collection('payments').updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'REFUNDED',
          refundId: refundResponse.refundId,
          refundAmount: payment.amount,
          refundReason: reason,
          refundedAt: new Date(),
          refundRequested: false,
        },
      }
    );
    await removeFromLibrary(db, payment);

    return c.json({
      success: true,
      message: 'Refund initiated successfully',
      data: { refundId: refundResponse.refundId, merchantRefundId, amount: payment.amount / 100 },
    });
  } catch (error) {
    console.error('❌ Refund error:', error);
    return c.json({ success: false, message: 'Failed to initiate refund', error: error.message }, 500);
  }
});

// ── GET /api/payments/download/:token (public — token is the auth) ────────
payments.get('/download/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const db = await getDb(c.env);
    const purchase = await db.collection('payments').findOne({ downloadToken: token });
    if (!purchase) return c.json({ success: false, error: 'Invalid download token' }, 404);

    const item =
      purchase.itemType === 'course'
        ? await db.collection('courses').findOne({ _id: purchase.courseId })
        : await db.collection('books').findOne({ _id: purchase.bookId });
    if (!item) return c.json({ success: false, error: 'The item for this purchase could not be found.' }, 404);

    if (purchase.downloadExpiresAt && new Date() > new Date(purchase.downloadExpiresAt)) {
      return c.json({ success: false, error: 'Download link has expired. Please contact support.' }, 403);
    }
    if (purchase.downloadCount >= purchase.maxDownloads) {
      return c.json({ success: false, error: `Download limit (${purchase.maxDownloads}) exceeded.` }, 403);
    }

    await db.collection('payments').updateOne({ _id: purchase._id }, { $inc: { downloadCount: 1 } });

    return c.json({
      success: true,
      data: {
        downloadUrl: item.pdfDownloadLink,
        filename: `${item.title}.pdf`,
        remainingDownloads: purchase.maxDownloads - (purchase.downloadCount + 1),
        expiresAt: purchase.downloadExpiresAt,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ── PhonePe webhook auth check ──────────────────────────────────────────────
async function verifyWebhookAuth(env, authorizationHeader) {
  const username = env.PHONEPE_WEBHOOK_USERNAME;
  const password = env.PHONEPE_WEBHOOK_PASSWORD;
  if (!username || !password) {
    console.error('❌ Webhook credentials not configured');
    return false;
  }
  const expectedHash = await sha256Hex(`${username}:${password}`);
  const receivedHash = (authorizationHeader || '').replace('Basic ', '').trim();
  const isValid = timingSafeEqualStr(expectedHash, receivedHash);
  if (!isValid) console.error('❌ Webhook auth mismatch');
  return isValid;
}

async function handleOrderCompleted(db, payload) {
  const { merchantOrderId, orderId, state, paymentDetails } = payload;
  const payment = await db.collection('payments').findOne({ merchantOrderId });
  if (!payment) return console.error('❌ Payment not found for webhook:', merchantOrderId);
  if (payment.status === 'SUCCESS') return console.log('⚠️ Already SUCCESS, skipping');

  const detail = paymentDetails?.[0] || {};
  const paymentMode = detail.paymentMode;
  const upiTransId = detail.splitInstruments?.[0]?.rail?.upiTransactionId;
  const vpa = detail.splitInstruments?.[0]?.rail?.vpa;

  const update = {
    status: 'SUCCESS',
    phonePeOrderId: orderId,
    paymentState: state,
    paymentMethod: paymentMode,
    completedAt: new Date(detail.timestamp || Date.now()),
    webhookReceived: true,
    paymentInstrument: { type: paymentMode, upiTransactionId: upiTransId, vpa },
  };
  if (!payment.downloadToken) update.downloadToken = randomHex(32);
  if (!payment.downloadExpiresAt) update.downloadExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  await db.collection('payments').updateOne({ _id: payment._id }, { $set: update });
  await addToLibrary(db, { ...payment, ...update });
  console.log(`✅ Payment SUCCESS saved for ${merchantOrderId}`);
}

async function handleOrderFailed(db, payload) {
  const { merchantOrderId, orderId, state, paymentDetails } = payload;
  const payment = await db.collection('payments').findOne({ merchantOrderId });
  if (!payment) return console.error('❌ Payment not found for failed webhook:', merchantOrderId);
  if (payment.status === 'FAILED') return console.log('⚠️ Already FAILED, skipping');

  const detail = paymentDetails?.[0] || {};
  await db.collection('payments').updateOne(
    { _id: payment._id },
    {
      $set: {
        status: 'FAILED',
        phonePeOrderId: orderId,
        paymentState: state,
        errorCode: detail.errorCode,
        errorMessage: detail.detailedErrorCode,
        webhookReceived: true,
      },
    }
  );
  console.log(`❌ Payment FAILED saved for ${merchantOrderId}`);
}

async function handleRefundAccepted(db, payload) {
  const { originalMerchantOrderId, merchantRefundId } = payload;
  const payment = await db.collection('payments').findOne({ merchantOrderId: originalMerchantOrderId });
  if (!payment) return console.error('❌ Payment not found for refund webhook:', originalMerchantOrderId);

  const refundId = payload.paymentDetails?.[0]?.transactionId || merchantRefundId;
  await db.collection('payments').updateOne({ _id: payment._id }, { $set: { status: 'REFUNDED', refundedAt: new Date(), refundId } });
  await removeFromLibrary(db, payment);
  console.log(`💸 Refund SUCCESS saved for ${originalMerchantOrderId}`);
}

// ── POST /api/payments/webhook (PhonePe S2S) ───────────────────────────────
payments.post('/webhook', async (c) => {
  try {
    const authHeader = c.req.header('Authorization') || c.req.header('authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);

    const isAuthValid = await verifyWebhookAuth(c.env, authHeader);
    if (!isAuthValid) return c.json({ success: false, message: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const { event, payload } = body;
    if (!event || !payload) return c.json({ success: false, message: 'Invalid payload' }, 400);

    console.log('📦 Webhook event:', event, '| Order:', payload.merchantOrderId);
    const db = await getDb(c.env);

    switch (event) {
      case 'checkout.order.completed':
        await handleOrderCompleted(db, payload);
        break;
      case 'checkout.order.failed':
        await handleOrderFailed(db, payload);
        break;
      case 'pg.refund.accepted':
        await handleRefundAccepted(db, payload);
        break;
      default:
        console.log(`⚠️ Unhandled webhook event: ${event}`);
    }

    return c.json({ success: true, message: 'Webhook processed' });
  } catch (err) {
    console.error('❌ Webhook processing error:', err.message);
    // Always 200 so PhonePe doesn't retry-storm us on our own bugs.
    return c.json({ success: true, message: 'Webhook received' });
  }
});

// ── GET /api/payments/redirect-callback (browser redirect from PhonePe) ───
payments.get('/redirect-callback', async (c) => {
  const frontend = c.env.FRONTEND_URL;
  try {
    const { merchantOrderId } = c.req.query();
    if (!merchantOrderId) return c.redirect(`${frontend}/payment/error?reason=missing_order`, 302);

    const db = await getDb(c.env);
    const payment = await db.collection('payments').findOne({ merchantOrderId });
    if (!payment) return c.redirect(`${frontend}/payment/error?reason=not_found`, 302);

    if (payment.webhookReceived && payment.status === 'SUCCESS') {
      return c.redirect(`${frontend}/payment/success?orderId=${merchantOrderId}&bookId=${payment.bookId || ''}`, 302);
    }
    if (payment.webhookReceived && payment.status === 'FAILED') {
      return c.redirect(`${frontend}/payment/failed?orderId=${merchantOrderId}&reason=${payment.errorCode || 'payment_failed'}`, 302);
    }

    const phonePeClient = new PhonePeV2Client(c.env);
    const statusResponse = await phonePeClient.checkOrderStatus(merchantOrderId);

    if (statusResponse.paymentStatus === 'SUCCESS') {
      if (payment.status !== 'SUCCESS') {
        const update = {
          status: 'SUCCESS',
          paymentState: statusResponse.state,
          paymentMethod: statusResponse.paymentInstrument?.type,
          completedAt: new Date(),
          paymentInstrument: statusResponse.paymentInstrument,
        };
        await db.collection('payments').updateOne({ _id: payment._id }, { $set: update });
        await addToLibrary(db, { ...payment, ...update });
      }
      return c.redirect(`${frontend}/payment/success?orderId=${merchantOrderId}&bookId=${payment.bookId || ''}`, 302);
    } else if (statusResponse.paymentStatus === 'FAILED') {
      if (payment.status !== 'FAILED') {
        await db.collection('payments').updateOne({ _id: payment._id }, { $set: { status: 'FAILED' } });
      }
      return c.redirect(`${frontend}/payment/failed?orderId=${merchantOrderId}&reason=payment_failed`, 302);
    }
    return c.redirect(`${frontend}/payment/processing?orderId=${merchantOrderId}`, 302);
  } catch (err) {
    console.error('❌ Redirect callback error:', err.message);
    return c.redirect(`${frontend}/payment/error?reason=server_error`, 302);
  }
});

// ── GET /api/payments/status/:merchantOrderId (frontend polling) ──────────
payments.get('/status/:merchantOrderId', protect, async (c) => {
  try {
    const merchantOrderId = c.req.param('merchantOrderId');
    const db = await getDb(c.env);

    let payment = await db.collection('payments').findOne({ merchantOrderId });
    if (!payment) return c.json({ success: false, message: 'Payment not found' }, 404);

    if (payment.status === 'PENDING' && !payment.webhookReceived) {
      try {
        const phonePeClient = new PhonePeV2Client(c.env);
        const statusResponse = await phonePeClient.checkOrderStatus(merchantOrderId);

        if (statusResponse.paymentStatus === 'SUCCESS') {
          const update = {
            status: 'SUCCESS',
            paymentState: statusResponse.state,
            completedAt: new Date(),
            paymentInstrument: statusResponse.paymentInstrument,
            downloadExpiresAt: payment.downloadExpiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          };
          await db.collection('payments').updateOne({ _id: payment._id }, { $set: update });
          payment = { ...payment, ...update };
          await addToLibrary(db, payment);
        } else if (statusResponse.paymentStatus === 'FAILED') {
          await db.collection('payments').updateOne({ _id: payment._id }, { $set: { status: 'FAILED' } });
          payment.status = 'FAILED';
        }
      } catch (liveCheckError) {
        console.error('⚠️ Live PhonePe status check failed, returning last known status:', liveCheckError.message);
      }
    }

    const book = payment.bookId ? await db.collection('books').findOne({ _id: payment.bookId }, { projection: { title: 1, thumbnail: 1, pdfDownloadLink: 1, price: 1 } }) : null;
    const course = payment.courseId ? await db.collection('courses').findOne({ _id: payment.courseId }, { projection: { title: 1, thumbnail: 1, pdfDownloadLink: 1, price: 1 } }) : null;

    return c.json({
      success: true,
      data: {
        status: payment.status,
        merchantOrderId: payment.merchantOrderId,
        phonePeOrderId: payment.phonePeOrderId,
        amount: payment.amount / 100,
        paymentMethod: payment.paymentMethod,
        itemType: payment.itemType,
        book,
        course,
        downloadToken: payment.status === 'SUCCESS' ? payment.downloadToken : undefined,
        completedAt: payment.completedAt,
        webhookReceived: payment.webhookReceived,
      },
    });
  } catch (err) {
    console.error('❌ Status check error:', err.message);
    return c.json({ success: false, message: 'Failed to get payment status', error: err.message }, 500);
  }
});

// ── Free downloads ──────────────────────────────────────────────────────────
payments.post('/downloadfree/:bookId', protect, async (c) => {
  try {
    const user = c.get('user');
    const bookId = new ObjectId(c.req.param('bookId'));
    const db = await getDb(c.env);

    const book = await db.collection('books').findOne({ _id: bookId });
    if (!book) return c.json({ success: false, error: 'Book not found' }, 404);
    if (book.isPaid) return c.json({ success: false, error: 'This book requires payment' }, 400);

    const existing = await db.collection('payments').findOne({ userId: user._id, bookId });
    if (existing) {
      return c.json({ success: true, data: { downloadUrl: book.pdfDownloadLink, filename: `${book.title}.pdf`, downloadToken: existing.downloadToken } });
    }

    const merchantOrderId = `FREE${Date.now()}${user._id.toString().slice(-6)}`;
    const downloadToken = randomHex(32);
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    await db.collection('payments').insertOne({
      userId: user._id,
      bookId,
      itemType: 'book',
      merchantOrderId,
      amount: 0,
      status: 'SUCCESS',
      paymentGateway: 'Free',
      downloadToken,
      downloadExpiresAt: expiresAt,
      maxDownloads: 100,
      paymentState: 'COMPLETED',
      purchasedAt: new Date(),
      createdAt: new Date(),
    });
    await db.collection('books').updateOne({ _id: bookId }, { $inc: { downloadCount: 1 } });

    return c.json({ success: true, data: { downloadUrl: book.pdfDownloadLink, filename: `${book.title}.pdf`, downloadToken } });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

payments.post('/downloadfree-course/:courseId', protect, async (c) => {
  try {
    const user = c.get('user');
    const courseId = new ObjectId(c.req.param('courseId'));
    const db = await getDb(c.env);

    const course = await db.collection('courses').findOne({ _id: courseId });
    if (!course) return c.json({ success: false, error: 'Course not found' }, 404);
    if (course.isPaid) return c.json({ success: false, error: 'This course requires payment' }, 400);

    const existing = await db.collection('payments').findOne({ userId: user._id, courseId });
    if (existing) {
      return c.json({ success: true, data: { downloadUrl: course.pdfDownloadLink, filename: `${course.title}.pdf`, downloadToken: existing.downloadToken } });
    }

    const merchantOrderId = `FREE${Date.now()}${user._id.toString().slice(-6)}`;
    const downloadToken = randomHex(32);
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    await db.collection('payments').insertOne({
      userId: user._id,
      courseId,
      itemType: 'course',
      merchantOrderId,
      amount: 0,
      status: 'SUCCESS',
      paymentGateway: 'Free',
      downloadToken,
      downloadExpiresAt: expiresAt,
      maxDownloads: 100,
      paymentState: 'COMPLETED',
      purchasedAt: new Date(),
      createdAt: new Date(),
    });
    await db.collection('courses').updateOne({ _id: courseId }, { $inc: { downloadCount: 1 } });

    return c.json({ success: true, data: { downloadUrl: course.pdfDownloadLink, filename: `${course.title}.pdf`, downloadToken } });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ── Buyer-initiated refund request ─────────────────────────────────────────
payments.post('/:paymentId/request-refund', protect, async (c) => {
  try {
    const user = c.get('user');
    const { reason } = await c.req.json().catch(() => ({}));
    const db = await getDb(c.env);
    const payment = await db.collection('payments').findOne({ _id: new ObjectId(c.req.param('paymentId')) });

    if (!payment) return c.json({ success: false, error: 'Purchase not found' }, 404);
    if (payment.userId.toString() !== user._id.toString()) return c.json({ success: false, error: 'This purchase does not belong to you' }, 403);
    if (payment.status !== 'SUCCESS') return c.json({ success: false, error: 'Only completed, paid purchases can be refunded' }, 400);
    if (payment.amount === 0) return c.json({ success: false, error: 'Free downloads are not eligible for a refund' }, 400);
    if (payment.refundRequested) return c.json({ success: false, error: 'A refund has already been requested for this purchase' }, 400);

    await db.collection('payments').updateOne(
      { _id: payment._id },
      { $set: { refundRequested: true, refundRequestedAt: new Date(), refundReason: reason || '' } }
    );

    return c.json({ success: true, message: 'Refund requested. Our team will review it shortly.', data: { merchantOrderId: payment.merchantOrderId } });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ── GET /api/payments/my-purchases ──────────────────────────────────────────
payments.get('/my-purchases', protect, async (c) => {
  try {
    const user = c.get('user');
    const db = await getDb(c.env);
    const list = await db
      .collection('payments')
      .aggregate([
        { $match: { userId: user._id, paymentState: 'COMPLETED' } },
        { $lookup: { from: 'books', localField: 'bookId', foreignField: '_id', as: 'bookId' } },
        { $unwind: { path: '$bookId', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'courses', localField: 'courseId', foreignField: '_id', as: 'courseId' } },
        { $unwind: { path: '$courseId', preserveNullAndEmptyArrays: true } },
        { $sort: { purchasedAt: -1 } },
      ])
      .toArray();

    return c.json({ success: true, count: list.length, data: list });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ── Admin: transactions ──────────────────────────────────────────────────────
payments.get('/transactions', protect, adminOnly, async (c) => {
  try {
    const { status, search } = c.req.query();
    const db = await getDb(c.env);

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (search) query.$or = [{ phonePeOrderId: { $regex: search, $options: 'i' } }];

    const transactions = await db
      .collection('payments')
      .aggregate([
        { $match: query },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'userId' } },
        { $unwind: { path: '$userId', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'books', localField: 'bookId', foreignField: '_id', as: 'bookId' } },
        { $unwind: { path: '$bookId', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'courses', localField: 'courseId', foreignField: '_id', as: 'courseId' } },
        { $unwind: { path: '$courseId', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            merchantOrderId: 1, amount: 1, status: 1, paymentGateway: 1, itemType: 1, purchasedAt: 1, createdAt: 1, completedAt: 1,
            'userId._id': 1, 'userId.fullName': 1, 'userId.email': 1, 'userId.mobileNumber': 1,
            'bookId._id': 1, 'bookId.title': 1, 'bookId.author': 1, 'bookId.thumbnail': 1, 'bookId.price': 1, 'bookId.category': 1,
            'courseId._id': 1, 'courseId.title': 1, 'courseId.author': 1, 'courseId.thumbnail': 1, 'courseId.price': 1, 'courseId.category': 1,
          },
        },
        { $sort: { purchasedAt: -1 } },
      ])
      .toArray();

    const stats = {
      total: transactions.length,
      completed: transactions.filter((t) => t.status === 'SUCCESS').length,
      pending: transactions.filter((t) => t.status === 'PENDING').length,
      failed: transactions.filter((t) => t.status === 'FAILED').length,
      refunded: transactions.filter((t) => t.status === 'REFUNDED').length,
      totalRevenue: transactions.filter((t) => t.status === 'SUCCESS').reduce((sum, t) => sum + (t.amount || 0), 0),
    };

    return c.json({ success: true, count: transactions.length, stats, data: transactions });
  } catch (error) {
    console.error('Get transactions error:', error);
    return c.json({ success: false, error: 'Failed to fetch transactions: ' + error.message }, 500);
  }
});

payments.get('/transactions/:id', protect, adminOnly, async (c) => {
  try {
    const db = await getDb(c.env);
    const list = await db
      .collection('payments')
      .aggregate([
        { $match: { _id: new ObjectId(c.req.param('id')) } },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'userId' } },
        { $unwind: { path: '$userId', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'books', localField: 'bookId', foreignField: '_id', as: 'bookId' } },
        { $unwind: { path: '$bookId', preserveNullAndEmptyArrays: true } },
      ])
      .toArray();

    if (!list[0]) return c.json({ success: false, error: 'Transaction not found' }, 404);
    return c.json({ success: true, data: list[0] });
  } catch (error) {
    console.error('Get transaction error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

payments.get('/stats', protect, adminOnly, async (c) => {
  try {
    const { startDate, endDate } = c.req.query();
    const db = await getDb(c.env);

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.purchasedAt = {};
      if (startDate) dateFilter.purchasedAt.$gte = new Date(startDate);
      if (endDate) dateFilter.purchasedAt.$lte = new Date(endDate);
    }

    const transactions = await db.collection('payments').find(dateFilter).toArray();

    const stats = {
      overview: {
        total: transactions.length,
        completed: transactions.filter((t) => t.status === 'SUCCESS').length,
        pending: transactions.filter((t) => t.status === 'PENDING').length,
        failed: transactions.filter((t) => t.status === 'FAILED').length,
        refunded: transactions.filter((t) => t.status === 'REFUNDED').length,
      },
      revenue: {
        total: transactions.filter((t) => t.status === 'SUCCESS').reduce((sum, t) => sum + t.amount, 0),
        refunded: transactions.filter((t) => t.status === 'REFUNDED').reduce((sum, t) => sum + t.amount, 0),
        pending: transactions.filter((t) => t.status === 'PENDING').reduce((sum, t) => sum + t.amount, 0),
      },
      paymentGateways: {
        PhonePe: transactions.filter((t) => t.paymentGateway === 'PhonePe').length,
        Free: transactions.filter((t) => t.paymentGateway === 'Free').length,
      },
      recentTransactions: await db
        .collection('payments')
        .aggregate([
          { $match: dateFilter },
          { $sort: { purchasedAt: -1 } },
          { $limit: 5 },
          { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'books', localField: 'bookId', foreignField: '_id', as: 'book' } },
          { $unwind: { path: '$book', preserveNullAndEmptyArrays: true } },
          { $project: { merchantOrderId: 1, amount: 1, status: 1, 'user.fullName': 1, 'book.title': 1 } },
        ])
        .toArray(),
    };

    return c.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

payments.put('/transactions/:id/status', protect, adminOnly, async (c) => {
  try {
    const user = c.get('user');
    const { status, note } = await c.req.json();
    const validStatuses = ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'];
    if (!validStatuses.includes(status)) return c.json({ success: false, error: 'Invalid status value' }, 400);

    const db = await getDb(c.env);
    const id = new ObjectId(c.req.param('id'));
    const transaction = await db.collection('payments').findOne({ _id: id });
    if (!transaction) return c.json({ success: false, error: 'Transaction not found' }, 404);

    const update = { status };
    if (note) {
      update.adminNotes = [...(transaction.adminNotes || []), { note, updatedBy: user._id, updatedAt: new Date() }];
    }
    await db.collection('payments').updateOne({ _id: id }, { $set: update });
    const updated = await db.collection('payments').findOne({ _id: id });

    return c.json({ success: true, message: 'Transaction status updated successfully', data: updated });
  } catch (error) {
    console.error('Update status error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

payments.get('/export', protect, adminOnly, async (c) => {
  try {
    const { status, startDate, endDate } = c.req.query();
    const db = await getDb(c.env);

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (startDate || endDate) {
      query.purchasedAt = {};
      if (startDate) query.purchasedAt.$gte = new Date(startDate);
      if (endDate) query.purchasedAt.$lte = new Date(endDate);
    }

    const transactions = await db
      .collection('payments')
      .aggregate([
        { $match: query },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'userId' } },
        { $unwind: { path: '$userId', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'books', localField: 'bookId', foreignField: '_id', as: 'bookId' } },
        { $unwind: { path: '$bookId', preserveNullAndEmptyArrays: true } },
        { $sort: { purchasedAt: -1 } },
      ])
      .toArray();

    const csvHeader = 'Order ID,User,Email,Book,Amount (INR),Status,Payment Gateway,Date\n';
    const csvRows = transactions
      .map((txn) => {
        const amountInRupees = (txn.amount || 0) / 100;
        return `${txn.merchantOrderId},${txn.userId?.fullName || 'N/A'},${txn.userId?.email || 'N/A'},${txn.bookId?.title || 'N/A'},${amountInRupees},${txn.status},${txn.paymentGateway},${new Date(txn.purchasedAt).toISOString()}`;
      })
      .join('\n');

    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename=transactions-${Date.now()}.csv`);
    return c.body(csvHeader + csvRows);
  } catch (error) {
    console.error('Export error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

payments.delete('/transactions/:id', protect, adminOnly, async (c) => {
  try {
    const user = c.get('user');
    const db = await getDb(c.env);
    const id = new ObjectId(c.req.param('id'));

    const transaction = await db
      .collection('payments')
      .aggregate([
        { $match: { _id: id } },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'userId' } },
        { $unwind: { path: '$userId', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'books', localField: 'bookId', foreignField: '_id', as: 'bookId' } },
        { $unwind: { path: '$bookId', preserveNullAndEmptyArrays: true } },
      ])
      .toArray()
      .then((r) => r[0]);

    if (!transaction) return c.json({ success: false, error: 'Transaction not found' }, 404);

    const deletableStatuses = ['FAILED', 'PENDING'];
    if (!deletableStatuses.includes(transaction.status)) {
      const forceDelete = c.req.query('force') === 'true';
      if (!forceDelete) {
        return c.json(
          {
            success: false,
            error: `Cannot delete ${transaction.status} transaction without force flag. This transaction has been completed.`,
            data: {
              merchantOrderId: transaction.merchantOrderId,
              status: transaction.status,
              amount: transaction.amount,
              user: transaction.userId?.fullName,
              book: transaction.bookId?.title,
              requiresForce: true,
            },
          },
          400
        );
      }
    }

    if (transaction.status === 'SUCCESS' && transaction.bookId) {
      await db.collection('books').updateOne({ _id: transaction.bookId._id }, { $inc: { downloadCount: -1 } });
    }

    const deletedTransactionData = {
      _id: transaction._id,
      merchantOrderId: transaction.merchantOrderId,
      user: transaction.userId?.email,
      book: transaction.bookId?.title,
      amount: transaction.amount,
      status: transaction.status,
      paymentGateway: transaction.paymentGateway,
      purchasedAt: transaction.purchasedAt,
      deletedBy: user.email,
      deletedAt: new Date(),
    };

    await db.collection('payments').deleteOne({ _id: id });

    return c.json({ success: true, message: 'Transaction deleted successfully', data: { deletedTransaction: deletedTransactionData } });
  } catch (error) {
    console.error('❌ Delete transaction error:', error);
    return c.json({ success: false, error: 'Failed to delete transaction: ' + error.message }, 500);
  }
});

payments.post('/transactions/bulk-delete', protect, adminOnly, async (c) => {
  try {
    const { transactionIds, force } = await c.req.json();
    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return c.json({ success: false, error: 'Invalid transaction IDs array' }, 400);
    }

    const db = await getDb(c.env);
    const ids = transactionIds.map((id) => new ObjectId(id));
    const transactions = await db.collection('payments').find({ _id: { $in: ids } }).toArray();
    if (transactions.length === 0) return c.json({ success: false, error: 'No transactions found' }, 404);

    const protectedTransactions = transactions.filter((t) => t.status === 'SUCCESS' || t.status === 'REFUNDED');
    if (protectedTransactions.length > 0 && !force) {
      return c.json(
        {
          success: false,
          error: `${protectedTransactions.length} transaction(s) are SUCCESS or REFUNDED and require force delete`,
          data: { protectedCount: protectedTransactions.length, totalCount: transactions.length, requiresForce: true },
        },
        400
      );
    }

    const completed = transactions.filter((t) => t.status === 'SUCCESS');
    for (const t of completed) {
      if (t.bookId) await db.collection('books').updateOne({ _id: t.bookId }, { $inc: { downloadCount: -1 } });
    }

    const result = await db.collection('payments').deleteMany({ _id: { $in: ids } });

    return c.json({ success: true, message: `${result.deletedCount} transaction(s) deleted successfully`, data: { deletedCount: result.deletedCount } });
  } catch (error) {
    console.error('❌ Bulk delete error:', error);
    return c.json({ success: false, error: 'Failed to delete transactions: ' + error.message }, 500);
  }
});

payments.delete('/cleanup', protect, adminOnly, async (c) => {
  try {
    const daysOld = parseInt(c.req.query('daysOld') || '30', 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const db = await getDb(c.env);
    const result = await db.collection('payments').deleteMany({ status: 'FAILED', purchasedAt: { $lt: cutoffDate } });

    return c.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} failed transaction(s)`,
      data: { deletedCount: result.deletedCount, cutoffDate },
    });
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default payments;
