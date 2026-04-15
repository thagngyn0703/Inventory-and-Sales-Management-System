require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const { initSocket } = require('./socket');

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const stocktakeRoutes = require('./routes/stocktakes');
const stockAdjustmentRoutes = require('./routes/stockAdjustments');
const stockHistoryRoutes = require('./routes/stockHistories');
const supplierRoutes = require('./routes/suppliers');
const productRequestRoutes = require('./routes/productRequests');
const invoiceRoutes = require('./routes/invoices');
const returnRoutes = require('./routes/returns');
const purchaseOrderRoutes = require('./routes/purchaseOrders');
const goodsReceiptRoutes = require('./routes/goodsReceipts');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const customerRoutes = require('./routes/customers');
const adminStoreRoutes = require('./routes/adminStores');
const adminDashboardRoutes = require('./routes/adminDashboard');
const userRoutes = require('./routes/users');
const rbacRoutes = require('./routes/rbac');
const paymentRoutes = require('./routes/payments');
const aiRoutes = require('./routes/ai');
const supplierPayableRoutes = require('./routes/supplierPayables');
const supplierReturnRoutes = require('./routes/supplierReturns');
const cashFlowRoutes = require('./routes/cashflows');
const supportTicketRoutes = require('./routes/supportTickets');
const backupRoutes = require('./routes/backup');
const storeSettingsRoutes = require('./routes/storeSettings');
const { startBackupScheduler } = require('./services/backupScheduler');
const { hasSmtpConfig } = require('./services/emailService');

const app = express();
const server = http.createServer(app);
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
// express.raw phải đăng ký TRƯỚC express.json để webhook SePay nhận được raw body
app.use('/api/payments/sepay/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stocktakes', stocktakeRoutes);
app.use('/api/stock-adjustments', stockAdjustmentRoutes);
app.use('/api/stock-histories', stockHistoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/goods-receipts', goodsReceiptRoutes);
app.use('/api/product-requests', productRequestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/admin/stores', adminStoreRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/rbac', rbacRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/supplier-payables', supplierPayableRoutes);
app.use('/api/supplier-returns', supplierReturnRoutes);
app.use('/api/cashflows', cashFlowRoutes);
app.use('/api/support-tickets', supportTicketRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/store-settings', storeSettingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ ok: true });
});

// Kết nối MongoDB rồi start server
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Đã kết nối MongoDB');
        initSocket(server);
        server.listen(PORT, () => {
            console.log(`Server chạy tại http://localhost:${PORT}`);
            // Khởi động backup scheduler sau khi server đã kết nối DB thành công
            startBackupScheduler();
        });
    })
    .catch((err) => {
        console.error('Lỗi kết nối MongoDB:', err.message);
        process.exit(1);
    });
