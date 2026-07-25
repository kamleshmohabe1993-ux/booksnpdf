// src/services/emailService.js
//
// The original used the `resend` npm SDK, which itself just wraps `fetch`
// calls to https://api.resend.com — so we call that REST endpoint directly
// here to avoid pulling in any dependency that might assume a Node runtime.

const COPY = {
  password_reset: {
    subject: '🔐 Your Password Reset OTP - BooksnPDF',
    heading: 'Password Reset Request',
    intro: 'We received a request to reset your password. Use the OTP below.',
  },
  email_verification: {
    subject: '✅ Verify Your Email - BooksnPDF',
    heading: 'Confirm Your Email Address',
    intro: 'Welcome to BooksnPDF! Use the OTP below to verify your email address.',
  },
};

export async function sendOTPEmail(env, email, otp, fullName, purpose = 'password_reset') {
  const copy = COPY[purpose] || COPY.password_reset;

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0891b2,#7c3aed);padding:32px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:26px;letter-spacing:1px;">📚 BooksnPDF</h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">${copy.heading}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 36px;">
              <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi ${fullName || 'there'} 👋</p>
              <p style="color:#6b7280;font-size:14px;margin:0 0 28px;line-height:1.6;">
                ${copy.intro} It expires in <strong>10 minutes</strong>.
              </p>
              <div style="background:#f5f3ff;border:2px dashed #7c3aed;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
                <p style="margin:0 0 8px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:2px;">Your OTP</p>
                <p style="margin:0;font-size:42px;font-weight:900;letter-spacing:12px;color:#7c3aed;">${otp}</p>
              </div>
              <div style="background:#fff7ed;border-left:4px solid #f97316;border-radius:6px;padding:14px 16px;margin-bottom:24px;">
                <p style="margin:0;color:#9a3412;font-size:13px;">
                  ⚠️ <strong>Never share this OTP</strong> with anyone. BooksnPDF will never ask for it.
                </p>
              </div>
              <p style="color:#9ca3af;font-size:13px;margin:0;line-height:1.6;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} BooksnPDF. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `"BooksnPDF eBooks Marketplace" <${env.EMAIL_USER}>`,
      to: email,
      subject: copy.subject,
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('❌ Resend error:', data);
    throw new Error('Failed to send email: ' + (data.message || res.statusText));
  }

  console.log('✅ Email sent via Resend, id:', data.id);
  return data;
}
