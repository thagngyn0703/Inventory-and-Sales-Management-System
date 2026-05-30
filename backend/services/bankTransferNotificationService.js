const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { emitNotificationCountRefresh, emitStorePaymentConfirmed, getIO } = require('../socket');

function toStoreObjectId(storeId) {
  const raw = String(storeId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
}

/**
 * Gửi thông báo nội bộ + realtime tới mọi manager/staff của cửa hàng khi CK được xác nhận.
 */
async function notifyStoreBankTransferPaid({
  storeId,
  paymentRef,
  invoiceId,
  amount,
  source = 'sepay',
  title: titleOverride,
  message: messageOverride,
  relatedEntity = 'sales_invoice',
  relatedId: relatedIdOverride,
  uniqueKeyBase,
}) {
  if (!storeId || !paymentRef) return;

  const storeOid = toStoreObjectId(storeId);
  if (!storeOid) return;
  const ref = String(paymentRef).trim().toUpperCase();
  const shortInv = invoiceId ? String(invoiceId).slice(-6).toUpperCase() : '';
  const amountNum = Math.round(Number(amount) || 0);
  const amountLabel = amountNum.toLocaleString('vi-VN');

  const users = await User.find({
    storeId: storeOid,
    role: { $in: ['manager', 'staff'] },
    status: { $ne: 'inactive' },
  })
    .select('_id')
    .lean();

  if (!users.length) {
    console.warn('[bankTransferNotification] no manager/staff for store', String(storeOid));
    return;
  }

  const title = titleOverride || 'Khách đã chuyển khoản';
  const message =
    messageOverride ||
    (shortInv
      ? `Đã nhận ${amountLabel}₫ — mã ${ref} (hóa đơn #${shortInv}).`
      : `Đã nhận ${amountLabel}₫ — mã ${ref}.`);

  const relatedId = relatedIdOverride || invoiceId || undefined;
  const baseKey =
    uniqueKeyBase ||
    (invoiceId ? `bank_transfer_paid:${invoiceId}` : `bank_transfer_paid:${ref}`);

  let createdCount = 0;
  for (const user of users) {
    const userId = String(user._id);
    try {
      await Notification.create({
        user_id: user._id,
        storeId: storeOid,
        type: 'bank_transfer_paid',
        title,
        message,
        related_entity: relatedEntity,
        related_id: relatedId,
        unique_key: `${baseKey}:${userId}`,
        is_read: false,
        created_at: new Date(),
      });
      createdCount += 1;
      await emitNotificationCountRefresh({ storeId: String(storeOid), userId });
    } catch (err) {
      if (err?.code !== 11000) {
        console.warn('[bankTransferNotification] create failed:', err.message);
      }
    }
  }

  if (createdCount === 0) return;

  emitStorePaymentConfirmed({
    storeId: String(storeOid),
    payment_ref: ref,
    invoice_id: invoiceId ? String(invoiceId) : null,
    amount: amountNum,
    source,
  });

  const io = getIO();
  if (io) {
    io.to(`store:${String(storeOid)}`).emit('manager:bank-transfer-paid', {
      title,
      message,
      payment_ref: ref,
      amount: amountNum,
    });
  }
}

module.exports = {
  notifyStoreBankTransferPaid,
};
