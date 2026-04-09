const express = require('express');
const mongoose = require('mongoose');
const SupportTicket = require('../models/SupportTicket');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const listPopulate = [
  { path: 'storeId', select: 'name' },
  { path: 'createdBy', select: 'fullName email' },
];

const detailPopulate = [
  { path: 'storeId', select: 'name address' },
  { path: 'createdBy', select: 'fullName email' },
  { path: 'replies.userId', select: 'fullName email' },
];

function isAdmin(req) {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'admin';
}

function isManager(req) {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'manager';
}

/** Danh sách: admin xem tất cả; manager chỉ cửa hàng của mình */
router.get('/', requireAuth, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const status = req.query.status;
    const filter = {};
    if (status && ['open', 'answered', 'closed'].includes(String(status))) {
      filter.status = status;
    }
    if (isManager(req)) {
      if (!req.user.storeId) {
        return res.status(403).json({ message: 'Manager chưa có cửa hàng.' });
      }
      filter.storeId = req.user.storeId;
    }

    const [items, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(listPopulate)
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);

    return res.json({ tickets: items, page, limit, total });
  } catch (err) {
    console.error('supportTickets list', err);
    return res.status(500).json({ message: 'Không thể tải phiếu hỗ trợ' });
  }
});

/** Chi tiết một phiếu */
router.get('/:id', requireAuth, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID không hợp lệ' });
    }
    const ticket = await SupportTicket.findById(id).populate(detailPopulate).lean();
    if (!ticket) return res.status(404).json({ message: 'Không tìm thấy phiếu' });

    if (isManager(req)) {
      if (!req.user.storeId || String(ticket.storeId?._id || ticket.storeId) !== String(req.user.storeId)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    return res.json({ ticket });
  } catch (err) {
    console.error('supportTickets get', err);
    return res.status(500).json({ message: 'Không thể tải phiếu' });
  }
});

/** Manager tạo phiếu mới (vẫn gửi được khi cửa hàng bị khóa — để liên hệ admin) */
router.post('/', requireAuth, requireRole(['manager'], { allowLockedStoreForManager: true }), async (req, res) => {
  try {
    const subject = String(req.body?.subject || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!subject || !body) {
      return res.status(400).json({ message: 'Vui lòng nhập tiêu đề và nội dung' });
    }
    if (!req.user.storeId) {
      return res.status(403).json({ message: 'Manager chưa có cửa hàng.' });
    }

    const ticket = await SupportTicket.create({
      storeId: req.user.storeId,
      createdBy: req.user.id,
      subject,
      body,
      status: 'open',
      replies: [],
    });

    const populated = await SupportTicket.findById(ticket._id).populate(detailPopulate).lean();
    return res.status(201).json({ ticket: populated });
  } catch (err) {
    console.error('supportTickets create', err);
    return res.status(500).json({ message: 'Không thể tạo phiếu hỗ trợ' });
  }
});

/** Trả lời / bổ sung: admin mọi phiếu; manager chỉ phiếu của cửa hàng mình */
router.post(
  '/:id/replies',
  requireAuth,
  requireRole(['admin', 'manager'], { allowLockedStoreForManager: true }),
  async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID không hợp lệ' });
    }
    const text = String(req.body?.body || '').trim();
    if (!text) {
      return res.status(400).json({ message: 'Nội dung trả lời không được để trống' });
    }

    const ticket = await SupportTicket.findById(id);
    if (!ticket) return res.status(404).json({ message: 'Không tìm thấy phiếu' });

    if (ticket.status === 'closed') {
      return res.status(400).json({ message: 'Phiếu đã đóng, không thể thêm trả lời' });
    }

    if (isManager(req)) {
      if (!req.user.storeId || String(ticket.storeId) !== String(req.user.storeId)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const role = isAdmin(req) ? 'admin' : 'manager';
    ticket.replies.push({
      userId: req.user.id,
      role,
      body: text,
    });
    if (role === 'admin') {
      ticket.status = 'answered';
    } else if (ticket.status === 'answered') {
      ticket.status = 'open';
    }
    await ticket.save();

    const populated = await SupportTicket.findById(ticket._id).populate(detailPopulate).lean();
    return res.json({ ticket: populated });
  } catch (err) {
    console.error('supportTickets reply', err);
    return res.status(500).json({ message: 'Không thể gửi trả lời' });
  }
});

/** Admin đóng / mở lại phiếu */
router.patch('/:id/status', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID không hợp lệ' });
    }
    const status = String(req.body?.status || '');
    if (!['open', 'answered', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    const ticket = await SupportTicket.findById(id);
    if (!ticket) return res.status(404).json({ message: 'Không tìm thấy phiếu' });

    ticket.status = status;
    await ticket.save();

    const populated = await SupportTicket.findById(ticket._id).populate(detailPopulate).lean();
    return res.json({ ticket: populated });
  } catch (err) {
    console.error('supportTickets status', err);
    return res.status(500).json({ message: 'Không thể cập nhật trạng thái' });
  }
});

module.exports = router;
