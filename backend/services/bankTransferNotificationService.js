const User = require('../models/User');
const Notification = require('../models/Notification');
const { emitNotificationCountRefresh, emitStorePaymentConfirmed } = require('../socket');

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

  const storeOid = String(storeId);
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
      await emitNotificationCountRefresh({ storeId: storeOid, userId });
    } catch (err) {
      if (err?.code !== 11000) {
        console.warn('[bankTransferNotification] create failed:', err.message);
      }
    }
  }

  emitStorePaymentConfirmed({
    storeId: storeOid,
    payment_ref: ref,
    invoice_id: invoiceId ? String(invoiceId) : null,
    amount: amountNum,
    source,
  });
}

module.exports = {
  notifyStoreBankTransferPaid,
};
