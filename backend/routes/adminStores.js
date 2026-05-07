const express = require('express');
const mongoose = require('mongoose');
const Store = require('../models/Store');
const TaxPolicy = require('../models/TaxPolicy');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { q = '', status = 'all', approval_status = 'all', page = '1', limit = '20', all = 'false' } = req.query;
    const shouldGetAll = String(all).toLowerCase() === 'true';
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = {};
    if (status === 'active' || status === 'inactive') filter.status = status;
    if (['draft_profile', 'pending_approval', 'approved', 'rejected', 'suspended'].includes(String(approval_status))) {
      filter.approval_status = String(approval_status);
    }
    if (String(q).trim()) {
      const re = new RegExp(escapeRegex(String(q).trim()), 'i');
      filter.$or = [{ name: re }, { phone: re }, { address: re }];
    }
    const total = await Store.countDocuments(filter);
    let storesQuery = Store.find(filter).sort({ createdAt: -1 });
    if (!shouldGetAll) {
      storesQuery = storesQuery.skip((pageNum - 1) * limitNum).limit(limitNum);
    }
    const stores = await storesQuery.populate('managerId', 'fullName email').populate('approved_by', 'fullName email').lean();
    return res.json({
      stores,
      total,
      page: shouldGetAll ? 1 : pageNum,
      limit: shouldGetAll ? total || 0 : limitNum,
      totalPages: shouldGetAll ? 1 : Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid store id' });
    const store = await Store.findById(id).populate('managerId', 'fullName email').lean();
    if (!store) return res.status(404).json({ message: 'Store not found' });
    return res.json({ store });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin chỉ xem danh sách và đổi trạng thái; tạo/sửa cửa hàng do manager đăng ký (auth/register-store).
router.post('/', requireAuth, requireRole(['admin']), (req, res) => {
  return res.status(403).json({ message: 'Admin không được tạo cửa hàng qua hệ thống này' });
});

router.put('/:id', requireAuth, requireRole(['admin']), (req, res) => {
  return res.status(403).json({ message: 'Admin không được chỉnh sửa thông tin cửa hàng qua hệ thống này' });
});

router.patch('/:id/status', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid store id' });
    const { status } = req.body || {};
    const nextStatus = status === 'inactive' ? 'inactive' : 'active';
    const store = await Store.findByIdAndUpdate(id, { status: nextStatus }, { new: true })
      .populate('managerId', 'fullName email')
      .lean();
    if (!store) return res.status(404).json({ message: 'Store not found' });
    await logAudit({
      storeId: store._id,
      actorId: req.user.id,
      action: 'store_status_updated',
      entityType: 'Store',
      entityId: store._id,
      note: `Admin đổi trạng thái hoạt động cửa hàng sang ${nextStatus}`,
      metadata: { status: nextStatus },
    });
    return res.json({ store });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:id/approval', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid store id' });
    const { approval_status, rejection_reason = '' } = req.body || {};
    if (!['approved', 'rejected', 'suspended', 'pending_approval', 'draft_profile'].includes(String(approval_status))) {
      return res.status(400).json({ message: 'approval_status không hợp lệ.' });
    }
    const currentStore = await Store.findById(id)
      .select('tax_code bank_account_number legal_representative business_license_number')
      .lean();
    if (!currentStore) return res.status(404).json({ message: 'Store not found' });

    const legalProfileCompleted = Boolean(
      String(currentStore.tax_code || '').trim() &&
      String(currentStore.bank_account_number || '').trim() &&
      String(currentStore.legal_representative || '').trim() &&
      String(currentStore.business_license_number || '').trim()
    );
    if (String(approval_status) === 'approved' && !legalProfileCompleted) {
      return res.status(400).json({
        message: 'Không thể phê duyệt: hồ sơ pháp lý chưa đầy đủ (MST, STK ngân hàng, đại diện pháp luật, số GPKD).',
      });
    }

    const updates = {
      approval_status: String(approval_status),
    };
    if (String(approval_status) === 'approved') {
      updates.approved_by = req.user.id;
      updates.approved_at = new Date();
      updates.rejection_reason = '';
      updates.status = 'active';
    } else if (String(approval_status) === 'rejected') {
      updates.rejection_reason = String(rejection_reason || '').trim();
      updates.approved_by = null;
      updates.approved_at = null;
      updates.status = 'inactive';
    } else if (String(approval_status) === 'suspended') {
      updates.status = 'inactive';
    }
    const store = await Store.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('managerId', 'fullName email')
      .populate('approved_by', 'fullName email')
      .lean();
    if (!store) return res.status(404).json({ message: 'Store not found' });
    await logAudit({
      storeId: store._id,
      actorId: req.user.id,
      action: 'store_approval_updated',
      entityType: 'Store',
      entityId: store._id,
      note: `Admin cập nhật phê duyệt cửa hàng sang ${updates.approval_status}`,
      metadata: { approval_status: updates.approval_status, rejection_reason: updates.rejection_reason || '' },
    });
    return res.json({ store });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:id/tax-policies/:policyId/approval', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id, policyId } = req.params;
    const { approval_state, reason_code = '', change_note = '' } = req.body || {};
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(policyId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    if (!['in_review', 'approved', 'active', 'inactive'].includes(String(approval_state))) {
      return res.status(400).json({ message: 'approval_state không hợp lệ.' });
    }
    const policy = await TaxPolicy.findOne({ _id: policyId, store_id: id, scope: 'store' });
    if (!policy) return res.status(404).json({ message: 'Tax policy not found' });
    if (String(approval_state) === 'active' && !String(reason_code || '').trim()) {
      return res.status(400).json({ message: 'reason_code là bắt buộc khi kích hoạt policy.' });
    }
    if (String(policy.approval_state) === 'active' && String(approval_state) === 'active') {
      return res.status(400).json({ message: 'Policy đã active.' });
    }
    if (String(policy.approval_state) === 'active' && String(approval_state) !== 'inactive') {
      return res.status(400).json({ message: 'Không được sửa policy đã effective, chỉ cho phép inactive/supersede.' });
    }
    policy.approval_state = String(approval_state);
    policy.change_reason_code = String(reason_code || '').trim();
    policy.change_note = String(change_note || '').trim();
    policy.reviewed_by = req.user.id;
    if (String(approval_state) === 'approved' || String(approval_state) === 'active') {
      policy.approved_by = req.user.id;
      policy.approved_at = new Date();
    }
    if (String(approval_state) === 'active') {
      policy.activated_at = new Date();
      await TaxPolicy.updateMany(
        {
          _id: { $ne: policy._id },
          store_id: id,
          scope: 'store',
          approval_state: 'active',
        },
        { $set: { approval_state: 'inactive' } }
      );
    }
    await policy.save();
    await logAudit({
      storeId: id,
      actorId: req.user.id,
      action: 'tax_policy_state_updated',
      entityType: 'TaxPolicy',
      entityId: policy._id,
      note: `Cập nhật policy sang ${policy.approval_state}`,
      metadata: { reason_code: policy.change_reason_code },
    });
    return res.json({ policy });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

