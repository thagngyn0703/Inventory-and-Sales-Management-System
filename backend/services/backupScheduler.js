/**
 * Backup Scheduler
 *
 * Lập lịch chạy backup tự động theo cấu hình trong .env:
 *
 * BACKUP_SCHEDULE_DAILY=true    → Full backup mỗi ngày lúc 01:00 sáng
 * BACKUP_SCHEDULE_HOURLY=false  → Backup thêm mỗi 4 tiếng (tùy chọn, cho hệ thống bận)
 *
 * Cách hoạt động: dùng setInterval + kiểm tra giờ hiện tại
 * (không cần cài thêm thư viện node-cron)
 */

const { runFullBackup } = require('./backupService');

// Theo dõi giờ đã backup để tránh chạy 2 lần cùng giờ
let lastDailyBackupHour = -1;
let lastHourlyBackupHour = -1;

/**
 * Kiểm tra và chạy backup daily (01:00 sáng mỗi ngày)
 */
async function checkDailyBackup() {
    const now = new Date();
    const currentHour = now.getHours();
    const targetHour = parseInt(process.env.BACKUP_DAILY_HOUR || '1', 10); // mặc định 1:00 AM

    if (currentHour === targetHour && lastDailyBackupHour !== currentHour) {
        lastDailyBackupHour = currentHour;
        console.log(`[Scheduler] Chạy daily backup lúc ${currentHour}:00...`);
        const result = await runFullBackup(null);
        if (result.success) {
            console.log(`[Scheduler] Daily backup hoàn thành (${result.elapsed}s)`);
        } else {
            console.error('[Scheduler] Daily backup THẤT BẠI:', result.db?.message || result.uploads?.message);
            // TODO: gửi cảnh báo qua email/Telegram nếu cấu hình
        }
    }
}

/**
 * Kiểm tra và chạy backup mỗi 4 tiếng (tuỳ chọn, bật qua BACKUP_SCHEDULE_HOURLY=true)
 */
async function checkHourlyBackup() {
    if (String(process.env.BACKUP_SCHEDULE_HOURLY).toLowerCase() !== 'true') return;

    const now = new Date();
    const currentHour = now.getHours();
    const isEvery4Hours = currentHour % 4 === 0; // 0, 4, 8, 12, 16, 20

    if (isEvery4Hours && lastHourlyBackupHour !== currentHour) {
        lastHourlyBackupHour = currentHour;
        console.log(`[Scheduler] Chạy 4-hourly backup lúc ${currentHour}:00...`);
        const result = await runFullBackup(null);
        if (result.success) {
            console.log(`[Scheduler] 4-hourly backup hoàn thành (${result.elapsed}s)`);
        } else {
            console.error('[Scheduler] 4-hourly backup THẤT BẠI:', result.db?.message);
        }
    }
}

/**
 * Khởi động scheduler
 * Kiểm tra mỗi 5 phút để quyết định có cần backup không
 */
function startBackupScheduler() {
    const enabled = String(process.env.BACKUP_SCHEDULE_DAILY).toLowerCase() !== 'false';

    if (!enabled) {
        console.log('[Scheduler] Backup scheduler đã tắt (BACKUP_SCHEDULE_DAILY=false)');
        return;
    }

    const dailyHour = parseInt(process.env.BACKUP_DAILY_HOUR || '1', 10);
    const hourlyEnabled = String(process.env.BACKUP_SCHEDULE_HOURLY).toLowerCase() === 'true';

    console.log(`[Scheduler] Backup scheduler đã khởi động:`);
    console.log(`  - Daily backup: ${dailyHour}:00 mỗi ngày`);
    console.log(`  - 4-hourly backup: ${hourlyEnabled ? 'BẬT' : 'TẮT'}`);
    console.log(`  - Giữ tối đa: ${process.env.BACKUP_MAX_COUNT || 14} bản`);

    // Kiểm tra mỗi 5 phút (300.000ms)
    const CHECK_INTERVAL_MS = 5 * 60 * 1000;

    setInterval(async () => {
        try {
            await checkDailyBackup();
            await checkHourlyBackup();
        } catch (err) {
            console.error('[Scheduler] Lỗi không mong đợi trong scheduler:', err.message);
        }
    }, CHECK_INTERVAL_MS);

    // Chạy kiểm tra ngay lần đầu khi khởi động
    setTimeout(async () => {
        try {
            await checkDailyBackup();
            await checkHourlyBackup();
        } catch (err) {
            console.error('[Scheduler] Lỗi kiểm tra lần đầu:', err.message);
        }
    }, 10000); // chờ 10s sau khi server start
}

module.exports = { startBackupScheduler };
