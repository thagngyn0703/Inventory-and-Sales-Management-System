const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER || 'noreply@example.com';

const hasSmtpConfig = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (hasSmtpConfig) {
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
    });
}

/**
 * Gửi mã xác minh thẳng vào email đăng ký (Gmail hoặc email người dùng nhập khi đăng ký).
 * Chỉ gửi thật qua SMTP; nếu chưa cấu hình SMTP thì không gửi và trả về false.
 * @param {string} registeredEmail - Email đăng ký (đích gửi duy nhất)
 * @param {string} fullName - Tên người dùng
 * @param {string} verificationToken - Mã 6 số
 * @returns {Promise<boolean>} true nếu đã gửi email thành công, false nếu không gửi được
 */
async function sendVerificationEmail(registeredEmail, fullName, verificationToken) {
    const to = registeredEmail.trim().toLowerCase();
    const subject = 'Xác minh email - Mã kích hoạt tài khoản';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 500px;">
            <h2>Xác minh tài khoản</h2>
            <p>Xin chào <strong>${fullName}</strong>,</p>
            <p>Bạn đã đăng ký tài khoản với email <strong>${to}</strong>. Vui lòng nhập mã xác minh sau vào trang web để kích hoạt:</p>
            <p style="font-size: 24px; letter-spacing: 4px; font-weight: bold; background: #f0f0f0; padding: 12px; border-radius: 8px;">${verificationToken}</p>
            <p style="color: #666;">Mã có hiệu lực trong 24 giờ. Nếu bạn không đăng ký, hãy bỏ qua email này.</p>
        </div>
    `;
    const text = `Mã xác minh của bạn: ${verificationToken}. Mã có hiệu lực trong 24 giờ.`;

    if (transporter) {
        try {
            await transporter.sendMail({
                from: EMAIL_FROM,
                to,
                subject,
                text,
                html,
            });
            return true;
        } catch (err) {
            console.error('Lỗi gửi email xác minh:', err.message);
            if (err.code === 'EAUTH') {
                console.error('Kiểm tra lại SMTP_USER và SMTP_PASS (dùng App Password của Gmail, không dùng mật khẩu đăng nhập).');
            }
            throw err;
        }
    }

    console.warn('--- SMTP chưa cấu hình: không gửi email xác minh. Cấu hình Gmail/SMTP trong .env để gửi mã vào email đăng ký. ---');
    console.warn('To (email đăng ký):', to);
    console.warn('Mã xác minh (không gửi):', verificationToken);
    return false;
}

module.exports = { sendVerificationEmail, hasSmtpConfig };
