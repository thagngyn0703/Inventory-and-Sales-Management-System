const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Supplier = require('../models/Supplier');
const { requireAuth, requireRole } = require('../middleware/auth');
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

// GET /api/suppliers?q=...&status=active|inactive|all&page=1&limit=20&sort=name|created_at  (staff, manager, admin)
// Staff cần đọc nhà cung cấp cho dropdown khi tạo phiếu nhập.
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const { q = '', status = 'active', page = '1', limit = '20', sort = 'name' } = req.query;
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
    const sortObj = String(sort || '') === 'created_at' ? { created_at: -1 } : { name: 1 };

    const suppliers = await Supplier.find(filter)
      .sort(sortObj)
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
