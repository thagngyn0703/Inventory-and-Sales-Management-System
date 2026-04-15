const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const xlsx = require('xlsx');
const Supplier = require('../models/Supplier');
const SupplierPayable = require('../models/SupplierPayable');
const SupplierPayment = require('../models/SupplierPayment');
const SupplierPaymentAllocation = require('../models/SupplierPaymentAllocation');
const SupplierDebtHistory = require('../models/SupplierDebtHistory');
const SupplierReturn = require('../models/SupplierReturn');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recalculatePayable, refreshSupplierPayableCache } = require('../utils/supplierPayableUtils');
const { upsertSystemCashFlow } = require('../utils/cashflowUtils');
const { ensureCloudinaryConfigured, hasCloudinaryConfig } = require('../services/cloudinary');

const router = express.Router();

const uploadSupplierQr = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = String(file.mimetype || '').startsWith('image/');
    if (ok) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  },
});

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeStr(v) {
  const s = v != null ? String(v).trim() : '';
  return s || '';
}

function normalizeUrl(v) {
  const s = normalizeStr(v);
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s;
  // Cho phép nhập domain trần; tự thêm https để tiện dùng.
  return `https://${s}`;
}

function normalizeContacts(contacts) {
  if (!Array.isArray(contacts)) return [];
  return contacts
    .map((c) => ({
      name: c?.name != null ? String(c.name).trim() : '',
      phone: c?.phone != null ? String(c.phone).trim() : '',
      email: c?.email != null ? String(c.email).trim().toLowerCase() : '',
      position: c?.position != null ? String(c.position).trim() : '',
      note: c?.note != null ? String(c.note).trim() : '',
    }))
    .filter((c) => c.name || c.phone || c.email || c.position || c.note);
}

function uploadBufferToCloudinary(buffer, folder = 'ims/suppliers/qr') {
  const cloud = ensureCloudinaryConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloud.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

const LOCAL_SUPPLIER_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'suppliers');

async function ensureLocalUploadDir() {
  await fs.promises.mkdir(LOCAL_SUPPLIER_UPLOAD_DIR, { recursive: true });
}

function extensionFromMimetype(mimetype) {
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return map[String(mimetype || '').toLowerCase()] || '.jpg';
}

async function uploadBufferToLocal(file, req) {
  await ensureLocalUploadDir();
  const ext = extensionFromMimetype(file.mimetype);
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const fullPath = path.join(LOCAL_SUPPLIER_UPLOAD_DIR, fileName);
  await fs.promises.writeFile(fullPath, file.buffer);
  const origin = `${req.protocol}://${req.get('host')}`;
  return {
    secure_url: `${origin}/uploads/suppliers/${fileName}`,
    public_id: `local/suppliers/${fileName}`,
  };
}

function getSupplierScopeFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  // manager và staff đều scope theo storeId
  const isStoreScopedRole = ['manager', 'staff'].includes(role);
  if (isStoreScopedRole) {
    return { storeId: req.user?.storeId || null };
  }
  return {};
}

function toOid(id) {
  return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

async function findSupplierDuplicate({ scopeFilter = {}, excludeId, code, tax_code, name }) {
  const or = [];

  const codeNorm = normalizeStr(code);
  if (codeNorm) or.push({ code: codeNorm });

  const taxNorm = normalizeStr(tax_code);
  if (taxNorm) or.push({ tax_code: taxNorm });

  const nameNorm = normalizeStr(name);
  if (nameNorm) {
    // exact match but case-insensitive
    or.push({ name: new RegExp(`^${escapeRegex(nameNorm)}$`, 'i') });
  }

  if (!or.length) return null;

  const filter = { ...scopeFilter, $or: or };
  if (excludeId && mongoose.isValidObjectId(excludeId)) {
    filter._id = { $ne: excludeId };
  }

  return Supplier.findOne(filter).select('_id code name tax_code').lean();
}

// POST /api/suppliers/upload-qr (manager, admin) - upload 1 ảnh QR
router.post(
  '/upload-qr',
  requireAuth,
  requireRole(['manager', 'admin']),
  (req, res, next) => {
    uploadSupplierQr.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Lỗi upload ảnh QR' });
      next();
    });
  },
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: 'Vui lòng chọn file ảnh QR' });
      let result;
      if (hasCloudinaryConfig()) {
        result = await uploadBufferToCloudinary(file.buffer);
      } else {
        result = await uploadBufferToLocal(file, req);
      }
      return res.json({
        image: { url: result.secure_url, public_id: result.public_id },
        bank_qr_image_url: result.secure_url,
      });
    } catch (err) {
      console.error('Upload supplier QR error:', err);
      return res.status(500).json({ message: err.message || 'Không thể upload ảnh QR' });
    }
  }
);

// POST /api/suppliers  (manager, admin)
router.post('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const scopeFilter = getSupplierScopeFilter(req);
    const {
      code,
      name,
      phone,
      email,
      address,
      tax_code,
      contacts,
      note,
      status,
      payable_account,
      bank_qr_image_url,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    const duplicate = await findSupplierDuplicate({ scopeFilter, code, tax_code, name });
    if (duplicate) {
      return res.status(409).json({
        message: 'Supplier already exists',
        duplicate,
      });
    }

    const doc = await Supplier.create({
      code: code != null && String(code).trim() ? String(code).trim() : undefined,
      name: String(name).trim(),
      phone: phone != null && String(phone).trim() ? String(phone).trim() : undefined,
      email: email != null && String(email).trim() ? String(email).trim().toLowerCase() : undefined,
      address: address != null && String(address).trim() ? String(address).trim() : undefined,
      tax_code: tax_code != null && String(tax_code).trim() ? String(tax_code).trim() : undefined,
      contacts: normalizeContacts(contacts),
      note: note != null && String(note).trim() ? String(note).trim() : undefined,
      status: status === 'inactive' ? 'inactive' : 'active',
      payable_account: payable_account != null ? Number(payable_account) || 0 : undefined,
      bank_qr_image_url: bank_qr_image_url != null ? normalizeUrl(bank_qr_image_url) || undefined : undefined,
      storeId:
        String(req.user?.role || '').toLowerCase() === 'admin'
          ? (req.body?.storeId && mongoose.isValidObjectId(req.body.storeId) ? req.body.storeId : undefined)
          : req.user?.role === 'manager'
            ? (req.user?.storeId || null)
            : undefined,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return res.status(201).json({ supplier: doc.toObject() });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ message: `${field} already exists` });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/suppliers?q=...&status=active|inactive|all&page=1&limit=20  (staff, manager, admin)
// Staff cần đọc nhà cung cấp cho dropdown khi tạo phiếu nhập.
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const { q = '', status = 'active', page = '1', limit = '20' } = req.query;
    const query = String(q || '').trim();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));

    const filter = getSupplierScopeFilter(req);
    const statusNorm = String(status || '').toLowerCase();
    if (statusNorm === 'active' || statusNorm === 'inactive') {
      filter.status = statusNorm;
    } else if (statusNorm !== 'all' && statusNorm !== '') {
      // unknown value -> keep default active behavior for backward compatibility
      filter.status = 'active';
    }

    if (query) {
      const re = new RegExp(escapeRegex(query), 'i');
      filter.$or = [
        { name: re },
        { code: re },
        { phone: re },
        { email: re },
        { address: re },
        { tax_code: re },
        { 'contacts.name': re },
        { 'contacts.phone': re },
        { 'contacts.email': re },
      ];
    }

    const total = await Supplier.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const suppliers = await Supplier.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    return res.json({
      suppliers,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/suppliers/:id  (staff, manager, admin)
// Staff cần đọc chi tiết nhà cung cấp khi tạo phiếu nhập.
router.get('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid supplier id' });
    }
    const scopeFilter = getSupplierScopeFilter(req);
    const supplier = await Supplier.findOne({ _id: id, ...scopeFilter }).lean();
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    return res.json({ supplier });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/suppliers/:id  (manager, admin)
router.put('/:id', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid supplier id' });
    }

    const scopeFilter = getSupplierScopeFilter(req);
    const supplier = await Supplier.findOne({ _id: id, ...scopeFilter });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const {
      code,
      name,
      phone,
      email,
      address,
      tax_code,
      contacts,
      note,
      status,
      payable_account,
      bank_qr_image_url,
    } = req.body || {};

    const nextCode = code !== undefined ? normalizeStr(code) : normalizeStr(supplier.code);
    const nextTax = tax_code !== undefined ? normalizeStr(tax_code) : normalizeStr(supplier.tax_code);
    const nextName = name !== undefined ? normalizeStr(name) : normalizeStr(supplier.name);

    const duplicate = await findSupplierDuplicate({
      scopeFilter,
      excludeId: id,
      code: nextCode,
      tax_code: nextTax,
      name: nextName,
    });
    if (duplicate) {
      return res.status(409).json({
        message: 'Supplier already exists',
        duplicate,
      });
    }

    if (code !== undefined) supplier.code = code && String(code).trim() ? String(code).trim() : undefined;
    if (name !== undefined) supplier.name = String(name).trim();
    if (phone !== undefined) supplier.phone = phone && String(phone).trim() ? String(phone).trim() : undefined;
    if (email !== undefined) supplier.email = email && String(email).trim() ? String(email).trim().toLowerCase() : undefined;
    if (address !== undefined) supplier.address = address && String(address).trim() ? String(address).trim() : undefined;
    if (tax_code !== undefined) supplier.tax_code = tax_code && String(tax_code).trim() ? String(tax_code).trim() : undefined;
    if (note !== undefined) supplier.note = note && String(note).trim() ? String(note).trim() : undefined;
    if (status !== undefined) supplier.status = status === 'inactive' ? 'inactive' : 'active';
    if (payable_account !== undefined) supplier.payable_account = Number(payable_account) || 0;
    if (bank_qr_image_url !== undefined) {
      supplier.bank_qr_image_url = normalizeUrl(bank_qr_image_url) || undefined;
    }
    if (contacts !== undefined) supplier.contacts = normalizeContacts(contacts);

    supplier.updated_at = new Date();
    await supplier.save();

    return res.json({ supplier: supplier.toObject() });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ message: `${field} already exists` });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/suppliers/:id/debt-history?page=1&limit=20&type=&from_date=&to_date
router.get('/:id/debt-history', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid supplier id' });
    const scopeFilter = getSupplierScopeFilter(req);
    const supplier = await Supplier.findOne({ _id: id, ...scopeFilter }).lean();
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const { page = '1', limit = '20', type, from_date, to_date } = req.query || {};
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = { supplier_id: supplier._id, ...(supplier.storeId ? { storeId: supplier.storeId } : {}) };
    if (type && String(type).trim()) filter.type = String(type).trim();
    if (from_date || to_date) {
      const range = {};
      if (from_date) {
        const from = new Date(from_date);
        if (Number.isNaN(from.getTime())) return res.status(400).json({ message: 'from_date không hợp lệ' });
        range.$gte = from;
      }
      if (to_date) {
        const to = new Date(to_date);
        if (Number.isNaN(to.getTime())) return res.status(400).json({ message: 'to_date không hợp lệ' });
        range.$lte = to;
      }
      filter.created_at = range;
    }

    const total = await SupplierDebtHistory.countDocuments(filter);
    const rows = await SupplierDebtHistory.find(filter)
      .sort({ created_at: -1, _id: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('actor_id', 'fullName email')
      .lean();
    return res.json({
      histories: rows.map((row) => ({
        ...row,
        actor_name: row.actor_id?.fullName || row.actor_id?.email || 'Hệ thống',
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      supplier: {
        _id: supplier._id,
        name: supplier.name,
        current_debt: round2(supplier.current_debt || supplier.payable_account || 0),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// GET /api/suppliers/:id/debt-history/export.xlsx?type=&from_date=&to_date=
router.get('/:id/debt-history/export.xlsx', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid supplier id' });
    const scopeFilter = getSupplierScopeFilter(req);
    const supplier = await Supplier.findOne({ _id: id, ...scopeFilter }).lean();
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const { type, from_date, to_date } = req.query || {};
    const filter = { supplier_id: supplier._id, ...(supplier.storeId ? { storeId: supplier.storeId } : {}) };
    if (type && String(type).trim()) filter.type = String(type).trim();
    if (from_date || to_date) {
      const range = {};
      if (from_date) {
        const from = new Date(from_date);
        if (Number.isNaN(from.getTime())) return res.status(400).json({ message: 'from_date không hợp lệ' });
        range.$gte = from;
      }
      if (to_date) {
        const to = new Date(to_date);
        if (Number.isNaN(to.getTime())) return res.status(400).json({ message: 'to_date không hợp lệ' });
        range.$lte = to;
      }
      filter.created_at = range;
    }

    const rows = await SupplierDebtHistory.find(filter)
      .sort({ created_at: -1, _id: -1 })
      .populate('actor_id', 'fullName email')
      .lean();

    const exportRows = rows.map((row) => ({
      'Thoi gian': row.created_at ? new Date(row.created_at).toLocaleString('vi-VN') : '',
      'Loai bien dong': row.type,
      'Chung tu': row.reference_id ? String(row.reference_id).slice(-6).toUpperCase() : '',
      'Bien dong': round2(row.change_amount || 0),
      'Du no sau': round2(row.after_debt || 0),
      'Nguoi thao tac': row.actor_id?.fullName || row.actor_id?.email || 'He thong',
      'Noi dung': row.note || '',
    }));

    const ws = xlsx.utils.json_to_sheet(exportRows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'SoNoNCC');
    const fileBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const stamp = new Date().toISOString().slice(0, 10);
    const safeSupplierName = String(supplier.name || 'supplier')
      .replace(/[^\w\-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="so-no-${safeSupplierName || 'supplier'}-${stamp}.xlsx"`);
    return res.send(fileBuffer);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/suppliers/:id/payments — ghi nhận thanh toán nợ gộp theo NCC
router.post('/:id/payments', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid supplier id' });
    const scopeFilter = getSupplierScopeFilter(req);
    const supplier = await Supplier.findOne({ _id: id, ...scopeFilter });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const {
      total_amount,
      payment_date,
      payment_method = 'cash',
      reference_code,
      note,
    } = req.body || {};
    const amount = Number(total_amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'total_amount phải lớn hơn 0' });
    }

    const openPayables = await SupplierPayable.find({
      supplier_id: supplier._id,
      storeId: supplier.storeId,
      status: { $in: ['open', 'partial'] },
      remaining_amount: { $gt: 0 },
    }).sort({ due_date: 1, created_at: 1 });
    if (!openPayables.length) {
      return res.status(400).json({ message: 'Nhà cung cấp hiện không có khoản nợ nào' });
    }
    const totalRemaining = openPayables.reduce((s, p) => s + (Number(p.remaining_amount) || 0), 0);
    if (amount > totalRemaining + 0.01) {
      return res.status(400).json({
        message: `Số tiền thanh toán (${amount.toLocaleString('vi-VN')}đ) vượt quá tổng còn nợ (${totalRemaining.toLocaleString('vi-VN')}đ)`,
      });
    }

    const beforeDebt = round2(Number(supplier.current_debt) || Number(supplier.payable_account) || 0);
    session.startTransaction();
    const [payment] = await SupplierPayment.create(
      [{
        supplier_id: supplier._id,
        storeId: supplier.storeId,
        total_amount: amount,
        payment_date: payment_date ? new Date(payment_date) : new Date(),
        payment_method,
        reference_code: reference_code || undefined,
        note: note || undefined,
        created_by: req.user.id,
      }],
      { session }
    );

    let remaining = amount;
    const allocations = [];
    const updatedPayableIds = [];
    for (const payable of openPayables) {
      if (remaining <= 0) break;
      const apply = Math.min(Number(payable.remaining_amount) || 0, remaining);
      remaining = round2(remaining - apply);
      allocations.push({
        payment_id: payment._id,
        payable_id: payable._id,
        amount: round2(apply),
      });
      updatedPayableIds.push(payable._id);
    }
    await SupplierPaymentAllocation.insertMany(allocations, { session });
    await session.commitTransaction();

    for (const pid of updatedPayableIds) {
      await recalculatePayable(pid);
    }
    await refreshSupplierPayableCache(supplier._id, supplier.storeId);
    const supplierAfter = await Supplier.findById(supplier._id).select('current_debt').lean();
    await SupplierDebtHistory.create({
      supplier_id: supplier._id,
      storeId: supplier.storeId,
      type: 'DEBT_DECREASE_PAYMENT',
      reference_type: 'supplier_payment',
      reference_id: payment._id,
      before_debt: beforeDebt,
      change_amount: -round2(amount),
      after_debt: round2(supplierAfter?.current_debt),
      note: note || 'Thanh toán công nợ NCC',
      actor_id: req.user.id,
      created_at: new Date(),
    });
    await upsertSystemCashFlow({
      storeId: supplier.storeId,
      type: 'EXPENSE',
      category: 'PURCHASE_PAYMENT',
      amount,
      paymentMethod: payment.payment_method,
      referenceModel: 'supplier_payment',
      referenceId: payment._id,
      note: note || 'Thanh toán công nợ NCC',
      actorId: req.user.id,
      transactedAt: payment.payment_date || new Date(),
    });

    const populated = await SupplierPayment.findById(payment._id)
      .populate('supplier_id', 'name')
      .populate('created_by', 'fullName email')
      .lean();
    return res.status(201).json({ payment: populated, allocations_count: allocations.length });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    return res.status(500).json({ message: err.message || 'Server error' });
  } finally {
    session.endSession();
  }
});

// POST /api/suppliers/:id/returns — ghi nhận phiếu trả hàng NCC (giảm nợ)
router.post('/:id/returns', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid supplier id' });
    const scopeFilter = getSupplierScopeFilter(req);
    const supplier = await Supplier.findOne({ _id: id, ...scopeFilter });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const {
      total_amount,
      return_date,
      reference_code,
      reason,
      note,
    } = req.body || {};
    const amount = Number(total_amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'total_amount phải lớn hơn 0' });
    }

    const openPayables = await SupplierPayable.find({
      supplier_id: supplier._id,
      storeId: supplier.storeId,
      status: { $in: ['open', 'partial'] },
      remaining_amount: { $gt: 0 },
    }).sort({ due_date: 1, created_at: 1 });
    if (!openPayables.length) {
      return res.status(400).json({ message: 'Nhà cung cấp hiện không có khoản nợ nào để giảm' });
    }
    const totalRemaining = openPayables.reduce((s, p) => s + (Number(p.remaining_amount) || 0), 0);
    if (amount > totalRemaining + 0.01) {
      return res.status(400).json({
        message: `Giá trị trả NCC (${amount.toLocaleString('vi-VN')}đ) vượt tổng còn nợ (${totalRemaining.toLocaleString('vi-VN')}đ)`,
      });
    }

    const beforeDebt = round2(Number(supplier.current_debt) || Number(supplier.payable_account) || 0);
    session.startTransaction();
    const [supplierReturn] = await SupplierReturn.create(
      [{
        supplier_id: supplier._id,
        storeId: supplier.storeId,
        total_amount: amount,
        reason: reason || 'Trả hàng nhà cung cấp',
        note: note || undefined,
        reference_code: reference_code || undefined,
        return_date: return_date ? new Date(return_date) : new Date(),
        status: 'approved',
        created_by: req.user.id,
        approved_by: req.user.id,
        approved_at: new Date(),
        created_at: new Date(),
      }],
      { session }
    );

    const [payment] = await SupplierPayment.create(
      [{
        supplier_id: supplier._id,
        storeId: supplier.storeId,
        total_amount: amount,
        payment_date: return_date ? new Date(return_date) : new Date(),
        payment_method: 'other',
        reference_code: reference_code || `RET-${String(supplierReturn._id).slice(-6).toUpperCase()}`,
        note: note || `Bù trừ công nợ do trả hàng NCC #${String(supplierReturn._id).slice(-6).toUpperCase()}`,
        created_by: req.user.id,
      }],
      { session }
    );

    let remaining = amount;
    const allocations = [];
    const updatedPayableIds = [];
    for (const payable of openPayables) {
      if (remaining <= 0) break;
      const apply = Math.min(Number(payable.remaining_amount) || 0, remaining);
      remaining = round2(remaining - apply);
      allocations.push({
        payment_id: payment._id,
        payable_id: payable._id,
        amount: round2(apply),
      });
      updatedPayableIds.push(payable._id);
    }
    const createdAllocations = await SupplierPaymentAllocation.insertMany(allocations, { session });
    const allocationIds = createdAllocations.map((a) => a._id);
    await SupplierReturn.findByIdAndUpdate(
      supplierReturn._id,
      { payment_id: payment._id, allocation_ids: allocationIds },
      { session }
    );
    await session.commitTransaction();

    for (const pid of updatedPayableIds) {
      await recalculatePayable(pid);
    }
    await refreshSupplierPayableCache(supplier._id, supplier.storeId);
    const supplierAfter = await Supplier.findById(supplier._id).select('current_debt').lean();
    await SupplierDebtHistory.create({
      supplier_id: supplier._id,
      storeId: supplier.storeId,
      type: 'DEBT_DECREASE_RETURN',
      reference_type: 'supplier_return',
      reference_id: supplierReturn._id,
      before_debt: beforeDebt,
      change_amount: -round2(amount),
      after_debt: round2(supplierAfter?.current_debt),
      note: reason || note || 'Giảm nợ do trả hàng nhà cung cấp',
      actor_id: req.user.id,
      created_at: new Date(),
    });
    await upsertSystemCashFlow({
      storeId: supplier.storeId,
      type: 'EXPENSE',
      category: 'PURCHASE_RETURN',
      amount,
      paymentMethod: 'other',
      referenceModel: 'supplier_return',
      referenceId: supplierReturn._id,
      note: reason || note || 'Giảm nợ do trả hàng nhà cung cấp',
      actorId: req.user.id,
      transactedAt: supplierReturn.return_date || new Date(),
    });

    return res.status(201).json({
      supplier_return: { ...supplierReturn.toObject(), payment_id: payment._id, allocation_ids: allocationIds },
      payment_id: payment._id,
      allocations_count: allocationIds.length,
    });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    return res.status(500).json({ message: err.message || 'Server error' });
  } finally {
    session.endSession();
  }
});

// PATCH /api/suppliers/:id/status  (manager, admin) - body: { status: 'active' | 'inactive' }
router.patch('/:id/status', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid supplier id' });
    }
    const scopeFilter = getSupplierScopeFilter(req);
    const { status } = req.body || {};
    const newStatus = status === 'inactive' ? 'inactive' : 'active';

    const supplier = await Supplier.findOneAndUpdate(
      { _id: id, ...scopeFilter },
      { status: newStatus, updated_at: new Date() },
      { new: true }
    ).lean();
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    return res.json({ supplier });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
