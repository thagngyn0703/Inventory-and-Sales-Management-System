/**
 * Backup & Restore Routes
 *
 * Chỉ admin mới được phép dùng các endpoint này.
 *
 * POST   /api/backup/run          → Chạy full backup ngay (manual)
 * POST   /api/backup/db           → Chỉ backup MongoDB
 * GET    /api/backup/list         → Danh sách file backup hiện có
 * GET    /api/backup/jobs         → Lịch sử các job backup/restore
 * POST   /api/backup/restore      → Restore từ file backup (cảnh báo: ghi đè DB!)
 */

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
    runFullBackup,
    backupMongoDB,
    restoreMongoDB,
    listBackupFiles,
} = require('../services/backupService');
const BackupRestoreJob = require('../models/BackupRestoreJob');

const router = express.Router();

// Tất cả routes đều yêu cầu đăng nhập + quyền admin
router.use(requireAuth, requireRole(['admin']));

/**
 * POST /api/backup/run
 * Chạy full backup ngay lập tức (MongoDB + Uploads)
 * Dùng khi muốn backup thủ công trước kiểm kho, trước đợt khuyến mãi lớn...
 */
router.post('/run', async (req, res) => {
    try {
        const result = await runFullBackup(req.user.id);

        if (result.success) {
            return res.json({
                success: true,
                message: 'Full backup hoàn thành',
                elapsed: result.elapsed,
                db: {
                    fileName: result.db.fileName,
                    fileSizeKB: result.db.fileSizeKB,
                },
                uploads: {
                    fileName: result.uploads.fileName,
                    message: result.uploads.message,
                },
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Backup thất bại',
            db: result.db,
            uploads: result.uploads,
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/backup/db
 * Chỉ backup MongoDB (không backup uploads)
 */
router.post('/db', async (req, res) => {
    try {
        const result = await backupMongoDB(req.user.id);

        if (result.success) {
            return res.json({
                success: true,
                message: result.message,
                fileName: result.fileName,
                fileSizeKB: result.fileSizeKB,
            });
        }

        return res.status(500).json({ success: false, message: result.message });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/backup/list
 * Lấy danh sách file backup có trên server
 */
router.get('/list', async (req, res) => {
    try {
        const files = listBackupFiles();
        return res.json({ success: true, total: files.length, files });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/backup/jobs
 * Lấy lịch sử các job backup/restore (lấy 50 job gần nhất)
 */
router.get('/jobs', async (req, res) => {
    try {
        const jobs = await BackupRestoreJob.find()
            .sort({ created_at: -1 })
            .limit(50)
            .populate('created_by', 'fullName email')
            .lean();

        return res.json({ success: true, total: jobs.length, jobs });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/backup/restore
 * Restore MongoDB từ file backup
 *
 * Body: { fileName: "backup-2026-04-14-0100.gz" }
 *
 * ⚠️ CẢNH BÁO: Thao tác này sẽ ghi đè toàn bộ dữ liệu hiện tại!
 * Chỉ dùng khi khôi phục sau sự cố, không dùng trên production đang chạy bình thường.
 */
router.post('/restore', async (req, res) => {
    try {
        const { fileName } = req.body || {};

        if (!fileName || typeof fileName !== 'string') {
            return res.status(400).json({ success: false, message: 'Thiếu fileName trong body' });
        }

        // Chỉ cho phép file .gz hoặc .zip, ngăn path traversal
        const safeName = require('path').basename(fileName);
        if (!safeName.startsWith('backup-') || (!safeName.endsWith('.gz') && !safeName.endsWith('.zip'))) {
            return res.status(400).json({
                success: false,
                message: 'Tên file không hợp lệ. Phải là file backup-.gz hoặc .zip',
            });
        }

        const result = await restoreMongoDB(safeName, req.user.id);

        if (result.success) {
            return res.json({ success: true, message: result.message });
        }

        return res.status(500).json({ success: false, message: result.message });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
