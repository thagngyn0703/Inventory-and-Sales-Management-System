const { syncExpiryNotificationsForAllStores } = require('./productExpiryNotificationService');

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const TARGET_HOUR = Number(process.env.EXPIRY_NOTIFY_HOUR ?? 7);

let lastRunDateKey = '';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function runExpiryNotificationJob() {
  try {
    const result = await syncExpiryNotificationsForAllStores();
    if (result.notified > 0) {
      console.log(`[Scheduler] Đã tạo ${result.notified} thông báo hạn sử dụng cho ${result.stores} cửa hàng.`);
    }
  } catch (err) {
    console.error('[Scheduler] Lỗi đồng bộ thông báo hạn sử dụng:', err.message || err);
  }
}

function startExpiryNotificationScheduler() {
  const enabled = String(process.env.EXPIRY_NOTIFY_SCHEDULE_DAILY ?? 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[Scheduler] Thông báo hạn sử dụng: TẮT (EXPIRY_NOTIFY_SCHEDULE_DAILY=false)');
    return;
  }

  console.log(`[Scheduler] Thông báo hạn sử dụng: kiểm tra mỗi giờ, chạy lúc ${TARGET_HOUR}:00`);

  setInterval(async () => {
    const now = new Date();
    const key = todayKey();
    if (now.getHours() !== TARGET_HOUR || lastRunDateKey === key) return;
    lastRunDateKey = key;
    await runExpiryNotificationJob();
  }, CHECK_INTERVAL_MS);

  // Chạy một lần khi khởi động server (bù trường hợp manager chưa mở màn thông báo)
  setTimeout(() => {
    runExpiryNotificationJob().catch(() => {});
  }, 15_000);
}

module.exports = {
  startExpiryNotificationScheduler,
  runExpiryNotificationJob,
};
