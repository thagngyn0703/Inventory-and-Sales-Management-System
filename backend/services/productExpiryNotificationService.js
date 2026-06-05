const Notification = require('../models/Notification');
const Product = require('../models/Product');
const User = require('../models/User');
const Store = require('../models/Store');
const { emitNotificationCountRefresh } = require('../socket');

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysUntil(expiryDate) {
  const today = startOfDay(new Date());
  const exp = startOfDay(expiryDate);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((exp.getTime() - today.getTime()) / msPerDay);
}

function formatExpiryDate(expiryDate) {
  try {
    return new Date(expiryDate).toLocaleDateString('vi-VN');
  } catch {
    return '';
  }
}

const EXPIRY_ALERTS = {
  expired: {
    type: 'product_expired',
    title: 'Sản phẩm đã hết hạn sử dụng',
    buildMessage: (product) =>
      `Sản phẩm "${product.name}" (SKU: ${product.sku}) đã hết hạn${product.expiry_date ? ` (${formatExpiryDate(product.expiry_date)})` : ''}. Tồn kho: ${Number(product.stock_qty || 0)}.`,
    keySuffix: 'expired',
  },
  '1_day': {
    type: 'product_expiry_1_day',
    title: 'Cảnh báo hạn sử dụng còn 1 ngày',
    buildMessage: (product) =>
      `Sản phẩm "${product.name}" (SKU: ${product.sku}) còn 1 ngày là hết hạn (hạn ${formatExpiryDate(product.expiry_date)}).`,
    keySuffix: '1',
  },
  '30_days': {
    type: 'product_expiry_30_days',
    title: 'Cảnh báo hạn sử dụng còn 1 tháng',
    buildMessage: (product) =>
      `Sản phẩm "${product.name}" (SKU: ${product.sku}) còn khoảng 1 tháng là hết hạn (hạn ${formatExpiryDate(product.expiry_date)}).`,
    keySuffix: '30',
  },
};

async function createExpiryNotification({ userId, storeId, product, kind }) {
  const alert = EXPIRY_ALERTS[kind];
  if (!alert || !userId || !storeId || !product?._id) return false;

  const uniqueKey = `product-expiry:${storeId}:${userId}:${product._id}:${alert.keySuffix}`;
  try {
    await Notification.create({
      user_id: userId,
      storeId,
      type: alert.type,
      title: alert.title,
      message: alert.buildMessage(product),
      related_entity: 'product',
      related_id: product._id,
      unique_key: uniqueKey,
      is_read: false,
      created_at: new Date(),
    });
    await emitNotificationCountRefresh({ storeId: String(storeId), userId: String(userId) });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

function resolveExpiryAlertKinds(daysLeft) {
  if (daysLeft < 0) return ['expired'];
  const kinds = [];
  if (daysLeft <= 30) kinds.push('30_days');
  if (daysLeft <= 1) kinds.push('1_day');
  return kinds;
}

async function syncExpiryNotificationsForStore(storeId) {
  if (!storeId) return { notified: 0 };

  const managers = await User.find({
    storeId,
    role: 'manager',
    status: { $ne: 'inactive' },
  })
    .select('_id')
    .lean();
  if (!managers.length) return { notified: 0 };

  const products = await Product.find({
    storeId,
    expiry_date: { $exists: true, $ne: null },
    status: { $ne: 'inactive' },
    stock_qty: { $gt: 0 },
  })
    .select('_id name sku expiry_date stock_qty')
    .lean();

  let notified = 0;
  for (const product of products) {
    const daysLeft = daysUntil(product.expiry_date);
    const kinds = resolveExpiryAlertKinds(daysLeft);
    if (!kinds.length) continue;

    for (const manager of managers) {
      for (const kind of kinds) {
        const created = await createExpiryNotification({
          userId: manager._id,
          storeId: String(storeId),
          product,
          kind,
        });
        if (created) notified += 1;
      }
    }
  }

  return { notified };
}

async function syncExpiryNotificationsForAllStores() {
  const stores = await Store.find({}).select('_id').lean();
  let totalNotified = 0;
  for (const store of stores) {
    const { notified } = await syncExpiryNotificationsForStore(String(store._id));
    totalNotified += notified;
  }
  return { stores: stores.length, notified: totalNotified };
}

async function syncExpiryNotificationsFromRequest(req) {
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId) return;
  await syncExpiryNotificationsForStore(storeId);
}

module.exports = {
  syncExpiryNotificationsForStore,
  syncExpiryNotificationsForAllStores,
  syncExpiryNotificationsFromRequest,
};
