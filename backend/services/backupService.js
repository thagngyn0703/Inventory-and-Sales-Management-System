/**
 * Backup Service
 *
 * Xử lý toàn bộ logic backup/restore cho hệ thống:
 * - Backup MongoDB bằng mongodump (full dump toàn bộ DB)
 * - Backup thư mục uploads (file ảnh, chứng từ)
 * - Lưu file backup vào thư mục local (backups/)
 * - Retention: tự động xóa file cũ theo cấu hình
 * - Ghi log vào collection BackupRestoreJob
 *
 * Nơi lưu backup: backend/backups/
 * Format tên file: backup-YYYY-MM-DD-HHmm.tar.gz (DB) / uploads-YYYY-MM-DD-HHmm.tar.gz (uploads)
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const BackupRestoreJob = require('../models/BackupRestoreJob');

const execAsync = promisify(exec);

// Thư mục lưu backup (tạo tự động nếu chưa có)
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
// Giữ tối đa bao nhiêu bản backup (mặc định 14 bản ~ 2 tuần)
const MAX_BACKUPS = parseInt(process.env.BACKUP_MAX_COUNT || '14', 10);

/**
 * Đảm bảo thư mục backups tồn tại
 */
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

/**
 * Tạo timestamp dạng YYYY-MM-DD-HHmm để đặt tên file
 */
function getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/**
 * Xóa file backup cũ, chỉ giữ lại MAX_BACKUPS bản mới nhất
 * @param {string} prefix - 'backup' hoặc 'uploads' để lọc đúng loại file
 */
function applyRetention(prefix) {
    try {
        const files = fs
            .readdirSync(BACKUP_DIR)
            .filter((f) => f.startsWith(prefix) && f.endsWith('.gz'))
            .map((f) => ({
                name: f,
                time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
            }))
            .sort((a, b) => b.time - a.time); // mới nhất trước

        // Xóa các file vượt quá giới hạn
        const toDelete = files.slice(MAX_BACKUPS);
        toDelete.forEach(({ name }) => {
            fs.unlinkSync(path.join(BACKUP_DIR, name));
            console.log(`[Backup] Đã xóa file cũ: ${name}`);
        });
    } catch (err) {
        console.error('[Backup] Lỗi khi dọn file cũ:', err.message);
    }
}

/**
 * Backup toàn bộ MongoDB database
 * Dùng mongodump với --archive và --gzip để tạo 1 file nén duy nhất
 *
 * @param {string} createdBy - userId của người trigger (null nếu auto)
 * @returns {Promise<{success: boolean, filePath: string, fileName: string, message: string}>}
 */
async function backupMongoDB(createdBy = null) {
    ensureBackupDir();
    const timestamp = getTimestamp();
    const fileName = `backup-${timestamp}.gz`;
    const filePath = path.join(BACKUP_DIR, fileName);

    // Ghi job vào DB với trạng thái pending
    let job = null;
    if (createdBy) {
        job = await BackupRestoreJob.create({
            created_by: createdBy,
            job_type: 'backup',
            status: 'in_progress',
            storage_path: filePath,
        });
    }

    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) throw new Error('MONGO_URI chưa được cấu hình trong .env');

        // Lệnh mongodump: dump toàn bộ DB, output dạng archive gzip
        const cmd = `mongodump --uri="${mongoUri}" --archive="${filePath}" --gzip`;
        console.log(`[Backup] Bắt đầu backup MongoDB → ${fileName}`);

        await execAsync(cmd);

        // Kiểm tra file có tồn tại và có dung lượng > 0
        const stat = fs.statSync(filePath);
        if (stat.size === 0) throw new Error('File backup rỗng, mongodump có thể bị lỗi');

        const fileSizeKB = Math.round(stat.size / 1024);
        console.log(`[Backup] MongoDB backup thành công: ${fileName} (${fileSizeKB} KB)`);

        // Áp dụng retention (xóa file cũ)
        applyRetention('backup');

        // Cập nhật job thành công
        if (job) {
            job.status = 'completed';
            job.finished_at = new Date();
            await job.save();
        }

        return { success: true, filePath, fileName, fileSizeKB, message: 'Backup MongoDB thành công' };
    } catch (err) {
        console.error('[Backup] Lỗi backup MongoDB:', err.message);

        // Xóa file rỗng/lỗi nếu có
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        // Cập nhật job thất bại
        if (job) {
            job.status = 'failed';
            job.finished_at = new Date();
            await job.save();
        }

        return { success: false, filePath: null, fileName: null, message: err.message };
    }
}

/**
 * Backup thư mục uploads (ảnh hóa đơn, chứng từ, file đính kèm)
 * Dùng zip/tar để nén toàn bộ thư mục uploads
 *
 * @param {string} createdBy - userId của người trigger
 * @returns {Promise<{success: boolean, filePath: string, fileName: string, message: string}>}
 */
async function backupUploads(createdBy = null) {
    ensureBackupDir();

    const uploadsDir = path.join(__dirname, '..', 'uploads');

    // Nếu không có thư mục uploads thì bỏ qua
    if (!fs.existsSync(uploadsDir)) {
        console.log('[Backup] Không có thư mục uploads, bỏ qua.');
        return { success: true, filePath: null, fileName: null, message: 'Không có uploads để backup' };
    }

    const timestamp = getTimestamp();
    const fileName = `uploads-${timestamp}.gz`;
    const filePath = path.join(BACKUP_DIR, fileName);

    // Lệnh tar để nén thư mục uploads (hoạt động trên Windows Git Bash / WSL / Linux)
    const isWindows = process.platform === 'win32';
    let cmd;
    if (isWindows) {
        // PowerShell: nén thư mục uploads thành zip
        const zipPath = filePath.replace('.gz', '.zip');
        cmd = `powershell -Command "Compress-Archive -Path '${uploadsDir}\\*' -DestinationPath '${zipPath}' -Force"`;
        try {
            console.log(`[Backup] Bắt đầu backup uploads → ${fileName}`);
            await execAsync(cmd);
            applyRetention('uploads');
            console.log(`[Backup] Uploads backup thành công: ${zipPath}`);
            return { success: true, filePath: zipPath, fileName: fileName.replace('.gz', '.zip'), message: 'Backup uploads thành công' };
        } catch (err) {
            console.error('[Backup] Lỗi backup uploads:', err.message);
            return { success: false, filePath: null, fileName: null, message: err.message };
        }
    } else {
        // Linux/Mac: dùng tar
        cmd = `tar -czf "${filePath}" -C "${path.join(__dirname, '..')}" uploads`;
        try {
            console.log(`[Backup] Bắt đầu backup uploads → ${fileName}`);
            await execAsync(cmd);
            applyRetention('uploads');
            console.log(`[Backup] Uploads backup thành công: ${fileName}`);
            return { success: true, filePath, fileName, message: 'Backup uploads thành công' };
        } catch (err) {
            console.error('[Backup] Lỗi backup uploads:', err.message);
            return { success: false, filePath: null, fileName: null, message: err.message };
        }
    }
}

/**
 * Chạy full backup: MongoDB + Uploads cùng lúc
 * @param {string} createdBy - userId
 * @returns {Promise<object>}
 */
async function runFullBackup(createdBy = null) {
    console.log('[Backup] === BẮT ĐẦU FULL BACKUP ===');
    const startTime = Date.now();

    const [dbResult, uploadsResult] = await Promise.all([
        backupMongoDB(createdBy),
        backupUploads(createdBy),
    ]);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Backup] === KẾT THÚC FULL BACKUP (${elapsed}s) ===`);

    return {
        success: dbResult.success && uploadsResult.success,
        elapsed,
        db: dbResult,
        uploads: uploadsResult,
    };
}

/**
 * Restore MongoDB từ file backup
 * Cảnh báo: thao tác này ghi đè dữ liệu hiện tại!
 *
 * @param {string} fileName - tên file backup (ví dụ: backup-2026-04-14-0100.gz)
 * @param {string} createdBy - userId
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function restoreMongoDB(fileName, createdBy) {
    const filePath = path.join(BACKUP_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        return { success: false, message: `Không tìm thấy file backup: ${fileName}` };
    }

    let job = null;
    if (createdBy) {
        job = await BackupRestoreJob.create({
            created_by: createdBy,
            job_type: 'restore',
            status: 'in_progress',
            storage_path: filePath,
        });
    }

    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) throw new Error('MONGO_URI chưa được cấu hình trong .env');

        // --drop: xóa collection hiện tại trước khi restore (tránh conflict)
        const cmd = `mongorestore --uri="${mongoUri}" --archive="${filePath}" --gzip --drop`;
        console.log(`[Restore] Bắt đầu restore từ: ${fileName}`);

        await execAsync(cmd);

        console.log(`[Restore] Restore thành công từ: ${fileName}`);

        if (job) {
            job.status = 'completed';
            job.finished_at = new Date();
            await job.save();
        }

        return { success: true, message: `Restore thành công từ ${fileName}` };
    } catch (err) {
        console.error('[Restore] Lỗi restore:', err.message);

        if (job) {
            job.status = 'failed';
            job.finished_at = new Date();
            await job.save();
        }

        return { success: false, message: err.message };
    }
}

/**
 * Lấy danh sách file backup hiện có trong thư mục backups/
 * @returns {Array<{fileName, fileSizeKB, createdAt}>}
 */
function listBackupFiles() {
    ensureBackupDir();
    try {
        return fs
            .readdirSync(BACKUP_DIR)
            .filter((f) => f.endsWith('.gz') || f.endsWith('.zip'))
            .map((f) => {
                const stat = fs.statSync(path.join(BACKUP_DIR, f));
                return {
                    fileName: f,
                    fileSizeKB: Math.round(stat.size / 1024),
                    createdAt: stat.birthtime || stat.mtime,
                };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch {
        return [];
    }
}

module.exports = {
    backupMongoDB,
    backupUploads,
    runFullBackup,
    restoreMongoDB,
    listBackupFiles,
};
