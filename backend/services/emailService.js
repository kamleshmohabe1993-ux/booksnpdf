// const nodemailer = require('nodemailer');

// // SOLUTION 2: Alternative Configuration (Port 465 - SSL)
// const createSSLTransporter = () => {
//     const user = process.env.EMAIL_USER.trim();
//     const pass = process.env.EMAIL_PASSWORD.trim();

//     return nodemailer.createTransport({
//         host: process.env.EMAIL_HOST || 'smtp.hostinger.com',
//         port: 465,
//         secure: true, // true for 465
//         auth: {
//             user: user,
//             pass: pass
//         },
//         tls: {
//             rejectUnauthorized: false
//         }
//     });
// };

// // SOLUTION 3: Using Domain SMTP
// const createDomainTransporter = () => {
//     const user = process.env.EMAIL_USER.trim();
//     const pass = process.env.EMAIL_PASSWORD.trim();
    
//     // Extract domain from email
//     const domain = user.split('@')[1];

//     return nodemailer.createTransport({
//         host: `mail.${domain}`, // e.g., mail.booksnpdf.com
//         port: 587,
//         secure: false,
//         auth: {
//             user: user,
//             pass: pass
//         },
//         tls: {
//             rejectUnauthorized: false
//         }
//     });
// };

// // Send OTP email with retry logic
// exports.sendOTPEmail = async (email, otp, fullName) => {
    
//     const mailOptions = {
//         from: `"PDF eBooks Marketplace" <${process.env.EMAIL_USER}>`,
//         to: email,
//         subject: 'Password Reset OTP - PDF eBooks Marketplace',
//         html: `
//             <!DOCTYPE html>
//             <html>
//             <head>
//                 <style>
//                     body {
//                         font-family: Arial, sans-serif;
//                         line-height: 1.6;
//                         color: #333;
//                     }
//                     .container {
//                         max-width: 600px;
//                         margin: 0 auto;
//                         padding: 20px;
//                         background-color: #f9f9f9;
//                     }
//                     .content {
//                         background-color: white;
//                         padding: 30px;
//                         border-radius: 10px;
//                         box-shadow: 0 2px 5px rgba(0,0,0,0.1);
//                     }
//                     .header {
//                         text-align: center;
//                         margin-bottom: 30px;
//                     }
//                     .header h1 {
//                         color: #4F46E5;
//                         margin: 0;
//                     }
//                     .otp-box {
//                         background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//                         color: white;
//                         padding: 20px;
//                         border-radius: 10px;
//                         text-align: center;
//                         margin: 30px 0;
//                     }
//                     .otp-code {
//                         font-size: 36px;
//                         font-weight: bold;
//                         letter-spacing: 8px;
//                         margin: 10px 0;
//                     }
//                     .footer {
//                         text-align: center;
//                         margin-top: 30px;
//                         color: #666;
//                         font-size: 12px;
//                     }
//                     .warning {
//                         background-color: #FEF3C7;
//                         padding: 15px;
//                         border-radius: 5px;
//                         margin-top: 20px;
//                     }
//                 </style>
//             </head>
//             <body>
//                 <div class="container">
//                     <div class="content">
//                         <div class="header">
//                             <h1>🔐 Password Reset Request</h1>
//                         </div>
                        
//                         <p>Hello ${fullName || 'User'},</p>
                        
//                         <p>We received a request to reset your password for your PDF eBooks Marketplace account.</p>
                        
//                         <p>Your One-Time Password (OTP) is:</p>
                        
//                         <div class="otp-box">
//                             <div style="font-size: 14px; opacity: 0.9;">Your OTP Code</div>
//                             <div class="otp-code">${otp}</div>
//                             <div style="font-size: 12px; opacity: 0.8;">Valid for 10 minutes</div>
//                         </div>
                        
//                         <p>Please enter this OTP on the password reset page to continue.</p>
                        
//                         <div class="warning">
//                             <strong>⚠️ Important:</strong>
//                             <ul>
//                                 <li>This OTP will expire in 10 minutes</li>
//                                 <li>You have 5 attempts to enter the correct OTP</li>
//                                 <li>If you didn't request this, please ignore this email</li>
//                                 <li>Do not share this OTP with anyone</li>
//                             </ul>
//                         </div>
                        
//                         <p>Best regards,<br>PDF eBooks Marketplace Team</p>
//                     </div>
                    
//                     <div class="footer">
//                         <p>This is an automated email, please do not reply.</p>
//                         <p>&copy; 2025 BooksnPDF. All rights reserved.</p>
//                     </div>
//                 </div>
//             </body>
//             </html>
//         `
//     };
    
//     // Only try the two main configurations (skip domain SMTP)
//     const transporters = [
//         { name: 'Port 465 (SSL)', create: createSSLTransporter }
//     ];

//     let lastError = null;

//     for (const config of transporters) {
//         try {
//             const transporter = config.create();
            
//             // Verify connection
//             await transporter.verify();
            
            
//             // Send email
//             const info = await transporter.sendMail(mailOptions);
//             return { success: true, messageId: info.messageId, method: config.name };
            
//         } catch (error) {
//             lastError = error;
//             continue; // Try next configuration
//         }
//     }

//     // If all configurations failed
//     throw new Error('Failed to send email: ' + lastError.message);
// };

// // Test email connection
// exports.testEmailConnection = async () => {
    
//     const configs = [
//         { name: 'Port 465 (SSL)', create: createSSLTransporter },
//         { name: 'Domain SMTP', create: createDomainTransporter }
//     ];

//     const results = [];

//     for (const config of configs) {
//         try {
//             const transporter = config.create();
//             await transporter.verify();
//             results.push({ name: config.name, status: 'success' });
//         } catch (error) {
//             results.push({ name: config.name, status: 'failed', error: error.message });
//         }
//     }

//     return results;
// };


const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

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

exports.sendOTPEmail = async (email, otp, fullName, purpose = 'password_reset') => {
    const copy = COPY[purpose] || COPY.password_reset;
    try {
        const { data, error } = await resend.emails.send({
            from: `"BooksnPDF eBooks Marketplace" <${process.env.EMAIL_USER}>`, // free no-domain sender
            to: email,
            subject: copy.subject,
            html: `
            <!DOCTYPE html>
            <html>
            <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
                <tr><td align="center">
                  <table width="480" cellpadding="0" cellspacing="0" 
                    style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    
                    <!-- Header -->
                    <tr>
                      <td style="background:linear-gradient(135deg,#0891b2,#7c3aed);padding:32px;text-align:center;">
                        <h1 style="color:#fff;margin:0;font-size:26px;letter-spacing:1px;">📚 BooksnPDF</h1>
                        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">${copy.heading}</p>
                      </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                      <td style="padding:40px 36px;">
                        <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi ${fullName || 'there'} 👋</p>
                        <p style="color:#6b7280;font-size:14px;margin:0 0 28px;line-height:1.6;">
                          ${copy.intro}
                          It expires in <strong>10 minutes</strong>.
                        </p>

                        <!-- OTP Box -->
                        <div style="background:#f5f3ff;border:2px dashed #7c3aed;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
                          <p style="margin:0 0 8px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:2px;">Your OTP</p>
                          <p style="margin:0;font-size:42px;font-weight:900;letter-spacing:12px;color:#7c3aed;">${otp}</p>
                        </div>

                        <!-- Warning -->
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

                    <!-- Footer -->
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
            </html>
            `
        });

        if (error) {
            console.error('❌ Resend error:', error);
            throw new Error('Failed to send email: ' + error.message);
        }

        console.log('✅ Email sent via Resend, id:', data.id);
        return data;

    } catch (err) {
        console.error('❌ sendOTPEmail error:', err.message);
        throw err;
    }
};
