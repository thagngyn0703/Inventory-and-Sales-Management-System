const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Notification = require('./models/Notification');
const Stocktake = require('./models/Stocktake');
const ProductRequest = require('./models/ProductRequest');
const GoodsReceipt = require('./models/GoodsReceipt');
const SupportTicket = require('./models/SupportTicket');

let io = null;

async function buildManagerCounts(storeId) {
  const [pendingStocktakes, pendingProductRequests, pendingGoodsReceipts, pendingSupportTickets] = await Promise.all([
    Stocktake.countDocuments({ storeId, status: 'submitted' }),
    ProductRequest.countDocuments({ storeId, status: 'pending' }),
    GoodsReceipt.countDocuments({ storeId, status: 'pending' }),
    SupportTicket.countDocuments({ storeId, status: 'open' }),
  ]);

  return {
    pendingStocktakes: Number(pendingStocktakes || 0),
    pendingProductRequests: Number(pendingProductRequests || 0),
    pendingGoodsReceipts: Number(pendingGoodsReceipts || 0),
    pendingSupportTickets: Number(pendingSupportTickets || 0),
  };
}

function getIO() {
  return io;
}

async function emitManagerBadgeRefresh({ storeId }) {
  if (!io || !storeId) return;
  const counts = await buildManagerCounts(storeId);
  io.to(`store:${storeId}:managers`).emit('manager:badge-counts-updated', counts);
}

async function emitNotificationCountRefresh({ storeId, userId }) {
  if (!io || !userId || !storeId) return;
  const unreadCount = await Notification.countDocuments({
    user_id: userId,
    storeId,
    is_read: false,
  });
  io.to(`user:${userId}`).emit('manager:notification-unread-updated', {
    unreadCount: Number(unreadCount || 0),
  });
}

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: true, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Unauthorized'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id role storeId status').lean();
      if (!user || user.status === 'inactive') return next(new Error('Unauthorized'));
      socket.user = {
        id: String(user._id),
        role: String(user.role || '').toLowerCase(),
        storeId: user.storeId ? String(user.storeId) : null,
      };
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user?.id;
    const storeId = socket.user?.storeId;
    const role = socket.user?.role;

    if (userId) socket.join(`user:${userId}`);
    if (storeId && (role === 'manager' || role === 'admin')) {
      socket.join(`store:${storeId}:managers`);
      try {
        const counts = await buildManagerCounts(storeId);
        socket.emit('manager:badge-counts-updated', counts);
        await emitNotificationCountRefresh({ storeId, userId });
      } catch (_) {
        // no-op
      }
    }
  });

  return io;
}

module.exports = {
  initSocket,
  getIO,
  buildManagerCounts,
  emitManagerBadgeRefresh,
  emitNotificationCountRefresh,
};
