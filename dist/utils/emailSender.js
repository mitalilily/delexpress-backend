"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendKycStatusEmail = exports.sendInvoiceReminderEmail = exports.sendInvoiceReadyEmail = exports.sendTempPasswordEmail = exports.sendEmployeeCredentials = exports.sendVerificationEmail = void 0;
// utils/emailSender.ts
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const path_1 = __importDefault(require("path"));
const mail_1 = __importDefault(require("@sendgrid/mail"));
// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
const EMAIL_FROM = process.env.EMAIL_FROM;
const GOOGLE_SMTP_USER = process.env.GOOGLE_SMTP_USER || EMAIL_FROM;
const GOOGLE_SMTP_PASSWORD = process.env.GOOGLE_SMTP_PASSWORD;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SENDGRID_API_KEY = process.env.TWILLIO_SENDGRID_API_KEY;
const SMTP_FROM = GOOGLE_SMTP_USER || EMAIL_FROM;
if (SENDGRID_API_KEY) {
    mail_1.default.setApiKey(SENDGRID_API_KEY);
}
// Create SMTP transporter (Hostinger/custom SMTP if provided, else Gmail service)
const createTransporter = () => {
    if (!GOOGLE_SMTP_PASSWORD) {
        console.warn('Google SMTP password not configured. Email not sent.');
        return null;
    }
    if (SMTP_HOST) {
        return nodemailer_1.default.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000,
            auth: {
                user: GOOGLE_SMTP_USER,
                pass: GOOGLE_SMTP_PASSWORD,
            },
        });
    }
    return nodemailer_1.default.createTransport({
        service: 'gmail',
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        auth: {
            user: GOOGLE_SMTP_USER,
            pass: GOOGLE_SMTP_PASSWORD, // Use App Password for Gmail
        },
    });
};
/**
 * Low-level sendEmail supporting optional attachments
 */
const sendEmail = async (to, subject, htmlContent, attachments) => {
    if (SENDGRID_API_KEY) {
        try {
            const sendGridAttachments = attachments && attachments.length
                ? await Promise.all(attachments.map(async (attachment) => {
                    let buffer;
                    if (attachment.buffer)
                        buffer = attachment.buffer;
                    else if (attachment.path)
                        buffer = fs_1.default.readFileSync(attachment.path);
                    else
                        throw new Error('Attachment must have path or buffer');
                    return {
                        content: buffer.toString('base64'),
                        filename: attachment.filename,
                        type: attachment.mimeType,
                        disposition: 'attachment',
                    };
                }))
                : undefined;
            await mail_1.default.send({
                to,
                from: `"DelExpress" <${EMAIL_FROM}>`,
                subject,
                html: htmlContent,
                attachments: sendGridAttachments,
            });
            console.log('Email sent successfully via SendGrid');
            return;
        }
        catch (error) {
            console.error('Error sending email via SendGrid:', error);
            console.warn('Falling back to SMTP transport after SendGrid failure.');
        }
    }
    const transporter = createTransporter();
    if (!transporter) {
        console.warn('Email transporter not configured. Email not sent.');
        return;
    }
    const mailOptions = {
        from: `"DelExpress" <${SMTP_FROM}>`,
        ...(EMAIL_FROM && EMAIL_FROM !== SMTP_FROM ? { replyTo: EMAIL_FROM } : {}),
        to,
        subject,
        html: htmlContent,
    };
    if (attachments && attachments.length) {
        mailOptions.attachments = await Promise.all(attachments.map(async (a) => {
            let buffer;
            if (a.buffer)
                buffer = a.buffer;
            else if (a.path)
                buffer = fs_1.default.readFileSync(a.path);
            else
                throw new Error('Attachment must have path or buffer');
            return {
                filename: a.filename,
                content: buffer,
                contentType: a.mimeType,
            };
        }));
    }
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
    }
    catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};
// Login / verification Email for OTP-based auth
const sendVerificationEmail = async (to, token) => {
    const html = `
    <div style="
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      max-width: 600px;
      margin: 32px auto;
      padding: 32px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background-color: #ffffff;
      color: #111827;
    ">
      <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">
        Sign in to DelExpress
      </h2>

      <p style="margin: 0 0 20px 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
        We received a request to sign in to your DelExpress account.  
        Please use the one-time verification code below to continue.
      </p>

      <div style="margin: 28px 0; text-align: center;">
        <span style="
          display: inline-block;
          padding: 14px 28px;
          font-size: 26px;
          font-weight: 700;
          background-color: #2563eb;
          color: #ffffff;
          border-radius: 8px;
          letter-spacing: 6px;
        ">
          ${token}
        </span>
      </div>

      <p style="margin: 0 0 12px 0; font-size: 13px; color: #4b5563;">
        This code will expire in <strong>6 minutes</strong> and can be used only once.
      </p>

      <p style="margin: 0 0 24px 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
        If you did not attempt to sign in, you can safely ignore this email.
        Your account will remain secure unless this code is entered.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        © ${new Date().getFullYear()} DelExpress. All rights reserved.
      </p>
    </div>
  `;
    await sendEmail(to, 'Your DelExpress verification code', html);
};
exports.sendVerificationEmail = sendVerificationEmail;
// Employee Credentials Email
const sendEmployeeCredentials = async (to, email, password, createdBy) => {
    const html = `
    <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #fafafa;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #1e293b; margin: 0;">Welcome to <span style="color:#2563eb;">DelExpress</span> 🚀</h2>
        <p style="font-size: 15px; color: #64748b; margin-top: 8px;">Your employee account has been created successfully.</p>
      </div>

      <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px; color: #334155; margin: 0 0 12px 0;">
          An account has been created for you by <strong>${createdBy}</strong>.
        </p>
        <p style="font-size: 16px; color: #334155; margin: 0 0 12px 0;">Here are your login credentials:</p>
        <table style="width: 100%; font-size: 15px; color: #1e293b; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px; font-weight: bold; width: 40%;">Email</td>
            <td style="padding: 8px; background: #f9fafb; border-radius: 4px;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Password</td>
            <td style="padding: 8px; background: #f9fafb; border-radius: 4px;">${password}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 14px; color: #64748b; margin-top: 28px; text-align: center;">
        You can now log in to your DelExpress account using these credentials.<br/>
        If you face any issues, please contact your administrator.
      </p>

      <div style="text-align: center; margin-top: 32px; font-size: 13px; color: #94a3b8;">
        — The DelExpress Team
      </div>
    </div>
  `;
    await sendEmail(to, 'Your DelExpress Employee Account', html);
};
exports.sendEmployeeCredentials = sendEmployeeCredentials;
const escapeHtml = (unsafe) => unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
const sendTempPasswordEmail = async (to, tempPassword) => {
    const safePassword = escapeHtml(tempPassword);
    const html = `
    <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width:600px; margin:auto; padding:32px; border:1px solid #e5e7eb; border-radius:12px; background-color:#f9fafb;">
      <div style="text-align:center; margin-bottom:24px;">
        <h2 style="color:#1e293b; margin:0;">DelExpress Account Password Reset</h2>
        <p style="font-size:15px; color:#64748b; margin-top:8px;">
          Your account password has been reset by our team.
        </p>
      </div>

      <div style="background:#fff; padding:20px; border-radius:8px; border:1px solid #e5e7eb; text-align:center;">
        <p style="font-size:16px; color:#334155; margin-bottom:16px;">
          Here is your temporary password:
        </p>
        <span style="display:inline-block; padding:12px 24px; font-size:20px; font-weight:bold; color:#ffffff; background-color:#2563eb; border-radius:6px; letter-spacing:1px;">
          ${safePassword}
        </span>
        <p style="font-size:14px; color:#64748b; margin-top:16px;">
          Use this password to log in and change it immediately.
        </p>
      </div>

      <p style="font-size:13px; color:#94a3b8; margin-top:28px; text-align:center;">
        If you did not request this, please contact our support immediately.<br/>
        — The DelExpress Team
      </p>
    </div>
  `;
    await sendEmail(to, 'Your Temporary DelExpress Password', html);
};
exports.sendTempPasswordEmail = sendTempPasswordEmail;
const sendInvoiceReadyEmail = async (opts) => {
    const { to, sellerName, invoiceNo, periodStart, periodEnd, totalAmount, pdfUrl, csvUrl, attachFiles = false, preferSignedUrls = false, } = opts;
    const safeSeller = sellerName ? sellerName : 'Seller';
    const html = `
  <div style="font-family: Arial, sans-serif; max-width:700px; margin:auto; padding:24px; color:#111">
    <h2 style="margin-bottom: 8px;">Your invoice is ready — ${invoiceNo}</h2>
    <p style="color:#555; margin-top:0;">Hello ${safeSeller},</p>
    <p style="color:#555">Your invoice for the period <strong>${periodStart}</strong> — <strong>${periodEnd}</strong> has been generated.</p>

    <table style="width:100%; margin-top:12px; border-collapse: collapse;">
      <tr>
        <td style="padding:8px; font-weight:600; width:40%;">Invoice No</td>
        <td style="padding:8px;">${invoiceNo}</td>
      </tr>
      <tr>
        <td style="padding:8px; font-weight:600;">Period</td>
        <td style="padding:8px;">${periodStart} — ${periodEnd}</td>
      </tr>
      <tr>
        <td style="padding:8px; font-weight:600;">Amount (GST inclusive)</td>
        <td style="padding:8px;">₹${Number(totalAmount).toFixed(2)}</td>
      </tr>
    </table>

    <div style="margin-top:16px;">
  ${preferSignedUrls && (pdfUrl || csvUrl)
        ? `<p style="margin-bottom:8px;">Download files:</p>
       ${pdfUrl ? `<p><a href="${pdfUrl}">Download PDF Invoice</a></p>` : ''}
       ${csvUrl ? `<p><a href="${csvUrl}">Download CSV breakdown</a></p>` : ''}`
        : `<p style="color:#555; margin-bottom:8px;">You can download the invoice files attached to this email.</p>`}
    </div>

    <p style="color:#777; margin-top:20px; font-size:13px;">
      If you have any questions or dispute an item on the invoice, please contact support or use the “raise dispute” option in your seller dashboard.
    </p>

    <div style="margin-top:22px; font-size:12px; color:#999;">
      — DelExpress Team
    </div>
  </div>
  `;
    // If attachFiles true and pdfUrl/csvUrl point to local files, attach them
    let attachments = undefined;
    if (attachFiles) {
        attachments = [];
        if (pdfUrl && !preferSignedUrls) {
            if (fs_1.default.existsSync(pdfUrl)) {
                attachments.push({ path: pdfUrl, filename: `${invoiceNo}.pdf` });
            }
        }
        if (csvUrl && !preferSignedUrls) {
            if (fs_1.default.existsSync(csvUrl)) {
                attachments.push({ path: csvUrl, filename: `${invoiceNo}.csv` });
            }
        }
    }
    await sendEmail(to, `Your Invoice ${invoiceNo} is ready`, html, attachments);
};
exports.sendInvoiceReadyEmail = sendInvoiceReadyEmail;
const sendInvoiceReminderEmail = async (opts) => {
    const { to, invoiceNo, amount, pdfUrl, csvUrl } = opts;
    const html = `
  <div style="font-family: Arial, sans-serif; max-width:700px; margin:auto; padding:24px; color:#111">
    <h2 style="margin-bottom: 8px; color: #dc2626;">Payment Reminder — Invoice ${invoiceNo}</h2>
    <p style="color:#555; margin-top:0;">Hello,</p>
    <p style="color:#555">This is a friendly reminder that your invoice <strong>${invoiceNo}</strong> with an outstanding amount of <strong>₹${Number(amount).toFixed(2)}</strong> is still pending payment.</p>

    <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #991b1b;">Outstanding Amount: ₹${Number(amount).toFixed(2)}</p>
    </div>

    <div style="margin-top:16px;">
      ${pdfUrl || csvUrl
        ? `<p style="margin-bottom:8px;">Access your invoice:</p>
       ${pdfUrl
            ? `<p><a href="${pdfUrl}" style="color: #2563eb; text-decoration: underline;">Download PDF Invoice</a></p>`
            : ''}
       ${csvUrl
            ? `<p><a href="${csvUrl}" style="color: #2563eb; text-decoration: underline;">Download CSV breakdown</a></p>`
            : ''}`
        : ''}
    </div>

    <p style="color:#777; margin-top:20px; font-size:13px;">
      Please make the payment at your earliest convenience. If you have already made the payment, please ignore this reminder.
    </p>

    <p style="color:#777; margin-top:16px; font-size:13px;">
      If you have any questions or need assistance, please contact our support team.
    </p>

    <div style="margin-top:22px; font-size:12px; color:#999;">
      — DelExpress Team
    </div>
  </div>
  `;
    await sendEmail(to, `Payment Reminder: Invoice ${invoiceNo}`, html);
};
exports.sendInvoiceReminderEmail = sendInvoiceReminderEmail;
const sendKycStatusEmail = async (opts) => {
    const { to, userName, status, reason } = opts;
    const safeName = userName || 'Merchant';
    const isApproved = status === 'verified';
    const subject = isApproved ? 'Your KYC has been approved' : 'Your KYC has been rejected';
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 10px;">
      <h2 style="margin: 0 0 10px 0; color: ${isApproved ? '#166534' : '#991b1b'};">
        ${isApproved ? 'KYC Approved' : 'KYC Rejected'}
      </h2>
      <p style="margin: 0 0 12px 0; color: #374151;">Hello ${safeName},</p>
      <p style="margin: 0 0 14px 0; color: #374151;">
        Your KYC verification status has been updated to:
        <strong>${isApproved ? 'Approved' : 'Rejected'}</strong>.
      </p>
      ${!isApproved && reason
        ? `<div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 14px 0; border-radius: 6px;">
               <p style="margin: 0; color: #7f1d1d;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
             </div>`
        : ''}
      <p style="margin: 14px 0 0 0; color: #6b7280; font-size: 13px;">
        If you need help, please contact support from your dashboard.
      </p>
      <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px;">— DelExpress Team</p>
    </div>
  `;
    await sendEmail(to, subject, html);
};
exports.sendKycStatusEmail = sendKycStatusEmail;
