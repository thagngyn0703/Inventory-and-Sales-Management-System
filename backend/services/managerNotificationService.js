const Notification = require('../models/Notification');
const User = require('../models/User');
const { emitNotificationCountRefresh } = require('../socket');

async function notifyUsers({ userIds = [], storeId = null, type, title, message, relatedEntity, relatedId }) {
  const targets = Array.from(new Set((userIds || []).map((x) => String(x)).filter(Boolean)));
  if (!targets.length || !storeId) return;

  const docs = targets.map((userId) => ({
    user_id: userId,
    storeId,
    type,
    title,
    message,
    related_entity: relatedEntity,
    related_id: relatedId || undefined,
    is_read: false,
    created_at: new Date(),
  }));
  await Notification.insertMany(docs, { ordered: false });
  await Promise.all(targets.map((userId) => emitNotificationCountRefresh({ storeId: String(storeId), userId })));
}

async function notifyManagersInStore({
  storeId,
  type,
  title,
  message,
  relatedEntity,
  relatedId,
}) {
  if (!storeId) return;
  const managers = await User.find({
    storeId,
    role: 'manager',
    status: { $ne: 'inactive' },
  })
    .select('_id')
    .lean();
  const userIds = managers.map((u) => String(u._id));
  await notifyUsers({
    userIds,
    storeId: String(storeId),
    type,
    title,
    message,
    relatedEntity,
    relatedId,
  });
}

module.exports = {
  notifyUsers,
  notifyManagersInStore,
};
