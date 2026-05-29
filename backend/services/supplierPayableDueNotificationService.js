const Notification = require('../models/Notification');
const SupplierPayable = require('../models/SupplierPayable');
const { emitNotificationCountRefresh } = require('../socket');

/** Nhắc manager trước hạn trả tối đa số ngày này (kể cả hôm nay). */
const REMINDER_DAYS_BEFORE = 7;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysUntil(dueDate) {
  const today = startOfDay(new Date());
  const due = startOfDay(dueDate);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((due.getTime() - today.getTime()) / msPerDay);
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function fmtMoney(amount) {
  return `${new Intl.NumberFormat('vi-VN').format(round2(amount))} đ`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('vi-VN');
}

function shortSourceId(id) {
  if (!id) return '';
  const s = String(id);
  return s.slice(-6).toUpperCase();
}

function dueWhenText(daysLeft) {
  if (daysLeft === 0) return 'hôm nay';
  if (daysLeft === 1) return 'ngày mai';
  return `còn ${daysLeft} ngày`;
}

async function createPayableDueReminderNotification({ userId, storeId, payable, daysLeft }) {
  const uniqueKey = `supplier-payable-due-7d:${storeId}:${userId}:${payable._id}`;
  const supplierName = payable.supplier_id?.name || 'Nhà cung cấp';
  const receiptRef = shortSourceId(payable.source_id);
  const dueStr = fmtDate(payable.due_date);
  const remainingStr = fmtMoney(payable.remaining_amount);
  const whenText = dueWhenText(daysLeft);

  const title = 'Nhắc hạn trả công nợ NCC';
  const message = receiptRef
    ? `Khoản nợ với "${supplierName}" (phiếu nhập #${receiptRef}) còn ${remainingStr}, hạn trả ${dueStr} (${whenText}).`
    : `Khoản nợ với "${supplierName}" còn ${remainingStr}, hạn trả ${dueStr} (${whenText}).`;

  try {
    await Notification.create({
      user_id: userId,
      storeId,
      type: 'supplier_payable_due_7d',
      title,
      message,
      related_entity: 'supplier_payable',
      related_id: payable._id,
      unique_key: uniqueKey,
      is_read: false,
      created_at: new Date(),
    });
    await emitNotificationCountRefresh({ storeId: String(storeId), userId: String(userId) });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
}

async function syncSupplierPayableDueNotificationsForUser({ userId, storeId }) {
  if (!storeId || !userId) return;

  const payables = await SupplierPayable.find({
    storeId,
    remaining_amount: { $gt: 0 },
    status: { $in: ['open', 'partial'] },
    due_date: { $exists: true, $ne: null },
  })
    .populate('supplier_id', 'name')
    .lean();

  for (const payable of payables) {
    const daysLeft = daysUntil(payable.due_date);
    if (daysLeft < 0) continue;
    if (daysLeft <= REMINDER_DAYS_BEFORE) {
      await createPayableDueReminderNotification({ userId, storeId, payable, daysLeft });
    }
  }
}

async function syncSupplierPayableDueNotificationsFromRequest(req) {
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId) return;
  await syncSupplierPayableDueNotificationsForUser({
    userId: req.user.id,
    storeId,
  });
}

module.exports = {
  REMINDER_DAYS_BEFORE,
  syncSupplierPayableDueNotificationsFromRequest,
  syncSupplierPayableDueNotificationsForUser,
};
