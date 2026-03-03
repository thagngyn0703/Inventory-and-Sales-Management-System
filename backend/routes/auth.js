const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const UnauthenticatedUser = require('../models/UnauthenticatedUser');
const { sendVerificationEmail } = require('../services/emailService');

const router = express.Router();

const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

function generateVerificationToken() {
    return crypto.randomInt(100000, 999999).toString();
}

// POST /api/auth/register — Lưu vào UnauthenticatedUser, gửi mã qua email
router.post('/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: 'Thiếu dữ liệu bắt buộc' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu phải >= 6 ký tự' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ message: 'Email đã tồn tại' });
        }

        const existingUnauth = await UnauthenticatedUser.findOne({ email: normalizedEmail });
        if (existingUnauth) {
            await UnauthenticatedUser.deleteOne({ _id: existingUnauth._id });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const verificationToken = generateVerificationToken();
        const verificationTokenExpires = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

        // Gửi mã xác minh thẳng vào email đăng ký (Gmail/email người dùng nhập). Chỉ lưu UnauthenticatedUser khi gửi thành công.
        const emailSent = await sendVerificationEmail(normalizedEmail, fullName.trim(), verificationToken);
        if (!emailSent) {
            return res.status(503).json({
                message: 'Hệ thống chưa cấu hình gửi email. Vui lòng cấu hình SMTP (Gmail) trong .env để gửi mã xác minh vào email đăng ký.',
            });
        }

        await UnauthenticatedUser.create({
            fullName: fullName.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            verificationToken,
            verificationTokenExpires,
        });

        res.status(201).json({
            message: 'Đăng ký thành công. Mã xác minh đã được gửi vào email đăng ký của bạn. Vui lòng kiểm tra hộp thư (và thư mục spam).',
            email: normalizedEmail,
        });
    } catch (err) {
        console.error(err);
        if (err.code === 'EAUTH') {
            return res.status(503).json({
                message: 'Lỗi xác thực SMTP. Kiểm tra SMTP_USER và SMTP_PASS trong .env (Gmail: dùng App Password, mật khẩu có khoảng trắng cần đặt trong dấu ngoặc kép).',
            });
        }
        if (err.responseCode || err.code) {
            return res.status(503).json({
                message: 'Không gửi được email. Kiểm tra cấu hình SMTP trong .env và kết nối mạng.',
            });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/auth/verify-email — Xác minh mã, chuyển từ UnauthenticatedUser sang User
router.post('/verify-email', async (req, res) => {
    try {
        const { email, token } = req.body;

        if (!email || !token) {
            return res.status(400).json({ message: 'Vui lòng nhập email và mã xác minh' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const unauth = await UnauthenticatedUser.findOne({
            email: normalizedEmail,
            verificationToken: token.trim(),
        });

        if (!unauth) {
            return res.status(400).json({ message: 'Email hoặc mã xác minh không đúng' });
        }

        if (new Date() > unauth.verificationTokenExpires) {
            await UnauthenticatedUser.deleteOne({ _id: unauth._id });
            return res.status(400).json({ message: 'Mã xác minh đã hết hạn. Vui lòng đăng ký lại.' });
        }

        const user = await User.create({
            fullName: unauth.fullName,
            email: unauth.email,
            password: unauth.password,
        });

        // Xóa khỏi collection UnauthenticatedUser ngay sau khi xác thực thành công
        await UnauthenticatedUser.deleteOne({ _id: unauth._id });

        const jwtToken = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token: jwtToken,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/auth/login — Chỉ User đã xác minh mới đăng nhập được
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(400).json({ message: 'Email hoặc mật khẩu không đúng' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Email hoặc mật khẩu không đúng' });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
