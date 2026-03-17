require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const supplierRoutes = require('./routes/suppliers');
const { hasSmtpConfig } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 8000;

if (!process.env.JWT_SECRET) {
    console.warn('Cảnh báo: JWT_SECRET chưa được cấu hình trong .env');
}
if (!process.env.MONGO_URI) {
    console.error('Lỗi: MONGO_URI chưa được cấu hình trong file .env');
    process.exit(1);
}
if (hasSmtpConfig) {
    console.log('SMTP: đã cấu hình — email xác minh sẽ gửi vào email đăng ký');
} else {
    console.warn('SMTP: chưa cấu hình — thêm SMTP_HOST, SMTP_USER, SMTP_PASS vào file .env');
}

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/suppliers', supplierRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ ok: true });
});

// Kết nối MongoDB rồi start server
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Đã kết nối MongoDB');
        app.listen(PORT, () => {
            console.log(`Server chạy tại http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Lỗi kết nối MongoDB:', err.message);
        process.exit(1);
    });
