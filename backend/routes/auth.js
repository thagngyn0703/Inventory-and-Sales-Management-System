const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Store = require('../models/Store');
const UnauthenticatedUser = require('../models/UnauthenticatedUser');
const PasswordReset = require('../models/PasswordReset');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
const RESET_TOKEN_EXPIRY_HOURS = 1;

function generateVerificationToken() {
    return crypto.randomInt(100000, 999999).toString();
}

// GET /api/auth/check-create-staff — kiểm tra backend có route create-staff
router.get('/check-create-staff', (req, res) => {
    res.json({ createStaffSupported: true });
});

// POST /api/auth/register — Lưu vào UnauthenticatedUser, gửi mã qua email
router.post('/register', async (req, res) => {
    try {
        const { fullName, email, password, role } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: 'Thiếu dữ liệu bắt buộc' });
        }

        const validRoles = ['manager'];
        if (!role || !validRoles.includes(role)) {
            return res.status(400).json({ message: 'Vui lòng chọn vai trò Manager' });
        }
        // Chỉ cho phép đăng ký với role Manager. Nhân viên (Staff) do Manager tạo sau khi đăng nhập.
        if (role !== 'manager') {
            return res.status(403).json({
                message: 'Đăng ký chỉ dành cho Manager. Tài khoản nhân viên (Staff) do chủ cửa hàng tạo trong hệ thống.',
            });
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
            role,
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

// POST /api/auth/create-staff — Manager tạo tài khoản nhân viên Staff (không cần xác thực email)
router.post('/create-staff', requireAuth, requireRole(['manager']), async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        const manager = await User.findById(req.user.id).lean();
        if (!manager) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        if (!manager.storeId) {
            return res.status(403).json({
                message: 'Manager chưa có cửa hàng. Vui lòng đăng ký cửa hàng trước khi tạo tài khoản nhân viên.',
                code: 'STORE_REQUIRED',
            });
        }

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

        const user = await User.create({
            fullName: fullName.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: 'staff',
            storeId: manager.storeId,
        });

        res.status(201).json({
            message: 'Tạo tài khoản nhân viên thành công. Nhân viên có thể đăng nhập ngay bằng email và mật khẩu (không cần xác thực email).',
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                storeId: user.storeId,
            },
        });
    } catch (err) {
        console.error('create-staff error:', err);
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Email đã tồn tại' });
        }
        res.status(500).json({ message: err.message || 'Server error' });
    }
});

// GET /api/auth/staff/my-store — Manager lấy danh sách nhân viên thuộc cửa hàng của mình
router.get('/staff/my-store', requireAuth, requireRole(['manager']), async (req, res) => {
    try {
        const manager = await User.findById(req.user.id).lean();
        if (!manager) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        if (!manager.storeId) {
            return res.status(403).json({
                message: 'Manager chưa có cửa hàng.',
                code: 'STORE_REQUIRED',
            });
        }

        const staff = await User.find({
            storeId: manager.storeId,
            role: { $in: ['staff', 'warehouse_staff', 'sales_staff'] },
        })
            .select('_id fullName email role storeId createdAt')
            .sort({ createdAt: -1 })
            .lean();

        return res.json({ staff });
    } catch (err) {
        console.error('list staff error:', err);
        return res.status(500).json({ message: 'Server error' });
    }
});

// PATCH /api/auth/staff/:id/remove-from-store — Manager gỡ nhân viên khỏi cửa hàng (không xóa tài khoản)
router.patch('/staff/:id/remove-from-store', requireAuth, requireRole(['manager']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'ID nhân viên không hợp lệ' });
        }

        const manager = await User.findById(req.user.id).lean();
        if (!manager) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        if (!manager.storeId) {
            return res.status(403).json({
                message: 'Manager chưa có cửa hàng.',
                code: 'STORE_REQUIRED',
            });
        }

        const staff = await User.findOne({
            _id: id,
            storeId: manager.storeId,
            role: { $in: ['staff', 'warehouse_staff', 'sales_staff'] },
        });
        if (!staff) {
            return res.status(404).json({ message: 'Không tìm thấy nhân viên trong cửa hàng của bạn' });
        }

        staff.storeId = null;
        await staff.save();

        return res.json({
            message: 'Đã gỡ nhân viên khỏi cửa hàng',
            user: {
                id: staff._id,
                fullName: staff.fullName,
                email: staff.email,
                role: staff.role,
                storeId: staff.storeId,
            },
        });
    } catch (err) {
        console.error('remove staff from store error:', err);
        return res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/auth/register-store — Manager tạo cửa hàng của mình
router.post('/register-store', requireAuth, requireRole(['manager'], { allowManagerWithoutStore: true }), async (req, res) => {
    try {
        const { name, address, phone } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Vui lòng nhập tên cửa hàng' });
        }

        const manager = await User.findById(req.user.id);
        if (!manager) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        if (manager.storeId) {
            return res.status(400).json({ message: 'Tài khoản đã có cửa hàng.' });
        }

        const store = await Store.create({
            name: name.trim(),
            address: (address || '').trim(),
            phone: (phone || '').trim(),
            managerId: manager._id,
        });

        manager.storeId = store._id;
        await manager.save();

        return res.status(201).json({
            message: 'Đăng ký cửa hàng thành công',
            store: {
                id: store._id,
                name: store.name,
                address: store.address,
                phone: store.phone,
                status: store.status,
            },
            user: {
                id: manager._id,
                fullName: manager.fullName,
                email: manager.email,
                role: manager.role,
                storeId: manager.storeId,
                storeName: store.name,
                storeStatus: store.status,
            },
        });
    } catch (err) {
        console.error('register-store error:', err);
        return res.status(500).json({ message: err.message || 'Server error' });
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
            role: unauth.role,
        });

        // Xóa khỏi collection UnauthenticatedUser ngay sau khi xác thực thành công
        await UnauthenticatedUser.deleteOne({ _id: unauth._id });

        const store = user.storeId ? await Store.findById(user.storeId).select('name status').lean() : null;

        const jwtToken = jwt.sign(
            { id: user._id, email: user.email, role: user.role, storeId: user.storeId || null },
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
                storeId: user.storeId,
                storeName: store?.name || null,
                storeStatus: store?.status || null,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/auth/forgot-password — Gửi mã đặt lại mật khẩu qua email
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.trim()) {
            return res.status(400).json({ message: 'Vui lòng nhập email' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(400).json({ message: 'Không tìm thấy tài khoản với email này' });
        }

        await PasswordReset.deleteMany({ email: normalizedEmail });

        const token = generateVerificationToken();
        const tokenDigitsOnly = String(token).replace(/\D/g, '');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

        const emailSent = await sendPasswordResetEmail(normalizedEmail, tokenDigitsOnly);
        if (!emailSent) {
            return res.status(503).json({
                message: 'Hệ thống chưa cấu hình gửi email. Vui lòng cấu hình SMTP trong .env.',
            });
        }

        await PasswordReset.create({ email: normalizedEmail, token: tokenDigitsOnly, expiresAt });

        res.json({
            message: 'Mã đặt lại mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư (và thư mục spam).',
            email: normalizedEmail,
        });
    } catch (err) {
        console.error('Lỗi forgot-password:', err.message);
        console.error('err.code:', err.code, 'err.responseCode:', err.responseCode);
        if (err.code === 'EAUTH') {
            return res.status(503).json({
                message: 'Lỗi xác thực SMTP. Kiểm tra SMTP_USER và SMTP_PASS trong .env (Gmail: dùng App Password).',
            });
        }
        if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
            return res.status(503).json({
                message: 'Không kết nối được máy chủ email. Kiểm tra SMTP_HOST, SMTP_PORT và mạng.',
            });
        }
        if (err.code || err.responseCode) {
            return res.status(503).json({
                message: 'Không gửi được email. Kiểm tra cấu hình SMTP trong .env.',
            });
        }
        return res.status(500).json({ message: 'Lỗi máy chủ. Thử lại sau.' });
    }
});

// POST /api/auth/reset-password — Xác minh mã và đổi mật khẩu
router.post('/reset-password', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;

        if (!email || !token || !newPassword) {
            return res.status(400).json({ message: 'Vui lòng nhập đủ email, mã xác nhận và mật khẩu mới' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu mới phải >= 6 ký tự' });
        }

        const normalizedEmail = (typeof email === 'string' ? email : String(email)).toLowerCase().trim();
        const normalizedToken = String(token).trim().replace(/\D/g, '');

        if (normalizedToken.length < 4) {
            return res.status(400).json({ message: 'Mã xác nhận phải có ít nhất 4 chữ số' });
        }

        const reset = await PasswordReset.findOne({
            email: normalizedEmail,
            token: normalizedToken,
        });

        if (!reset) {
            return res.status(400).json({ message: 'Email hoặc mã xác nhận không đúng' });
        }
        if (new Date() > reset.expiresAt) {
            await PasswordReset.deleteOne({ _id: reset._id });
            return res.status(400).json({ message: 'Mã đã hết hạn. Vui lòng yêu cầu gửi lại mã.' });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            await PasswordReset.deleteOne({ _id: reset._id });
            return res.status(400).json({ message: 'Tài khoản không tồn tại' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        await PasswordReset.deleteOne({ _id: reset._id });

        return res.json({ message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' });
    } catch (err) {
        console.error('Lỗi reset-password:', err);
        return res.status(500).json({ message: err.message || 'Lỗi máy chủ. Thử lại sau.' });
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

        if (user.status === 'inactive') {
            return res.status(403).json({ message: 'Tài khoản đã bị vô hiệu hoá. Vui lòng liên hệ quản trị viên.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Email hoặc mật khẩu không đúng' });
        }

        const store = user.storeId ? await Store.findById(user.storeId).select('name status').lean() : null;

        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role, storeId: user.storeId || null },
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
                storeId: user.storeId,
                storeName: store?.name || null,
                storeStatus: store?.status || null,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/me', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).lean();
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const store = user.storeId ? await Store.findById(user.storeId).select('name status').lean() : null;
        return res.json({
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                storeId: user.storeId || null,
                storeName: store?.name || null,
                storeStatus: store?.status || null,
            },
        });
    } catch (err) {
        return res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
