const express = require('express');
const mongoose = require('mongoose');
const ProductRequest = require('../models/ProductRequest');
const Product = require('../models/Product');
const ProductUnit = require('../models/ProductUnit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { emitManagerBadgeRefresh } = require('../socket');
const { notifyManagersInStore } = require('../services/managerNotificationService');

const router = express.Router();

console.log('ProductRequests route loaded');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getStoreScopeFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  if (!req.user?.storeId || !mongoose.isValidObjectId(req.user.storeId)) return null;
  return { storeId: req.user.storeId };
}

function normalizeProduct(p) {
  if (!p) return p;
  const base = p.base_unit || 'Cái';
  const units = p.selling_units && p.selling_units.length > 0
    ? p.selling_units
    : [{ name: base, ratio: 1, sale_price: p.sale_price != null ? p.sale_price : 0 }];
  const baseUnit = units.find((u) => u.ratio === 1) || units[0];
  return { ...p, selling_units: units, sale_price: baseUnit ? baseUnit.sale_price : (p.sale_price || 0) };
}

const TEXT_NO_SPECIAL_REGEX = /^[\p{L}\p{N}\s]+$/u;
const SKU_REGEX = /^[\p{L}\p{N},]+$/u;
const DIGITS_ONLY_REGEX = /^\d+$/;

function trimText(value) {
  return String(value || '').trim();
}

async function findBarcodeDuplicate({ barcode, storeId, excludeProductId }) {
  const b = trimText(barcode);
  if (!b) return null;
  const productFilter = { barcode: b, ...(storeId ? { storeId } : { storeId: null }) };
  if (excludeProductId && mongoose.isValidObjectId(excludeProductId)) productFilter._id = { $ne: excludeProductId };
  const inProduct = await Product.findOne(productFilter).select('_id barcode sku name').lean();
  if (inProduct) return inProduct;
  const unitFilter = { barcode: b, ...(storeId ? { storeId } : { storeId: null }) };
  if (excludeProductId && mongoose.isValidObjectId(excludeProductId)) unitFilter.product_id = { $ne: excludeProductId };
  const unitDup = await ProductUnit.findOne(unitFilter).select('_id barcode product_id unit_name').lean();
  if (!unitDup) return null;
  const ownerProduct = await Product.findOne({
    _id: unitDup.product_id,
    ...(storeId ? { storeId } : { storeId: null }),
  })
    .select('_id name sku')
    .lean();
  if (!ownerProduct) return null;
  return {
    ...unitDup,
    product_name: ownerProduct.name,
    product_sku: ownerProduct.sku,
  };
}

async function syncProductUnitsFromRequest(productDoc, requestDoc) {
  if (!productDoc?._id || !requestDoc) return;
  const baseName = trimText(requestDoc.base_unit || productDoc.base_unit || 'Cái') || 'Cái';
  const reqUnits = Array.isArray(requestDoc.selling_units) && requestDoc.selling_units.length > 0
    ? requestDoc.selling_units
    : [{ name: baseName, ratio: 1, sale_price: requestDoc.sale_price || productDoc.sale_price || 0 }];
  const normalized = reqUnits.map((u) => ({
    unit_name: trimText(u.name) || baseName,
    exchange_value: Number(u.ratio) > 0 ? Number(u.ratio) : 1,
    price: Math.round(Number(u.sale_price) || 0),
    barcode: trimText(u.barcode) || undefined,
  }));
  const hasBase = normalized.some((u) => Number(u.exchange_value) === 1);
  if (!hasBase) {
    normalized.unshift({
      unit_name: baseName,
      exchange_value: 1,
      price: normalized[0] ? normalized[0].price : Math.round(Number(productDoc.sale_price) || 0),
      barcode: trimText(requestDoc.barcode) || undefined,
    });
  }
  const baseIdx = normalized.findIndex((u) => Number(u.exchange_value) === 1);
  if (baseIdx >= 0 && !normalized[baseIdx].barcode) {
    const requestBaseBarcode = trimText(requestDoc.barcode);
    if (requestBaseBarcode) normalized[baseIdx].barcode = requestBaseBarcode;
  }

  const bulkOps = normalized.map((u) => ({
    updateOne: {
      filter: { product_id: productDoc._id, unit_name: u.unit_name },
      update: {
        $set: {
          storeId: productDoc.storeId || null,
          unit_name: u.unit_name,
          exchange_value: u.exchange_value,
          price: u.price,
          barcode: u.barcode,
          is_base: Number(u.exchange_value) === 1,
          updated_at: new Date(),
        },
        $setOnInsert: { created_at: new Date() },
      },
      upsert: true,
    },
  }));
  if (bulkOps.length > 0) await ProductUnit.bulkWrite(bulkOps, { ordered: false });
}

// POST /api/product-requests (staff, manager, admin)
router.post('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  console.log('POST /api/product-requests called by', req.user?.id, req.user?.role);
  console.log('body:', JSON.stringify(req.body).slice(0, 1000));
  try {
    const storeFilter = getStoreScopeFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
    }
    const {
      category_id,
      name,
      sku,
      barcode,
      supplier_id: bodySupplierId,
      cost_price,
      sale_price,
      stock_qty,
      reorder_level,
      base_unit,
      selling_units: bodyUnits,
      expiry_date: bodyExpiry,
      image_urls: bodyImageUrls,
      note
    } = req.body || {};

    const trimmedName = trimText(name);
    const trimmedSku = trimText(sku);
    const trimmedBarcode = trimText(barcode);
    if (!trimmedName) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (!TEXT_NO_SPECIAL_REGEX.test(trimmedName)) {
      return res.status(400).json({ message: 'Tên sản phẩm không được chứa ký tự đặc biệt.' });
    }
    if (!trimmedSku) {
      return res.status(400).json({ message: 'sku is required' });
    }
    if (!SKU_REGEX.test(trimmedSku)) {
      return res.status(400).json({ message: 'SKU chỉ được gồm chữ, số và dấu phẩy.' });
    }
    if (trimmedBarcode && !DIGITS_ONLY_REGEX.test(trimmedBarcode)) {
      return res.status(400).json({ message: 'Barcode chỉ được nhập số, không chữ hoặc ký tự đặc biệt.' });
    }

    // Chặn trùng sản phẩm theo SKU/tên/barcode để ép chuẩn SOP (nhập hàng trên sản phẩm đã có).
    const existingProduct = await Product.findOne({
      ...(storeFilter.storeId ? { storeId: storeFilter.storeId } : {}),
      $or: [
        { sku: trimmedSku },
        { name: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
        ...(trimmedBarcode ? [{ barcode: trimmedBarcode }] : []),
      ],
    });
    if (existingProduct) {
      return res.status(409).json({
        message: 'Sản phẩm đã tồn tại. Vui lòng dùng luồng nhập hàng cho sản phẩm có sẵn để tránh tạo trùng.',
        code: 'PRODUCT_ALREADY_EXISTS_USE_RECEIPT_FLOW',
        existing_product_id: existingProduct._id,
      });
    }

    const base = base_unit ? String(base_unit).trim() : 'Cái';
    let selling_units = Array.isArray(bodyUnits) && bodyUnits.length > 0
      ? bodyUnits.map((u) => ({
        name: String(u.name || '').trim() || base,
        ratio: Number(u.ratio) > 0 ? Number(u.ratio) : 1,
        sale_price: Number(u.sale_price) >= 0 ? Number(u.sale_price) : 0,
        barcode: trimText(u.barcode) || undefined,
      }))
      : [{ name: base, ratio: 1, sale_price: Number(sale_price) >= 0 ? Number(sale_price) : 0 }];

    const hasBase = selling_units.some((u) => u.ratio === 1);
    if (!hasBase) {
      selling_units = [{ name: base, ratio: 1, sale_price: selling_units[0] ? selling_units[0].sale_price : 0 }, ...selling_units];
    }

    const seenUnitNames = new Set();
    const seenUnitBarcodes = new Set();
    for (const u of selling_units) {
      const unitName = trimText(u.name);
      if (!unitName || !TEXT_NO_SPECIAL_REGEX.test(unitName)) {
        return res.status(400).json({ message: 'Tên đơn vị bán không hợp lệ.' });
      }
      const unitNameKey = unitName.toLowerCase();
      if (seenUnitNames.has(unitNameKey)) {
        return res.status(400).json({ message: 'Tên đơn vị bán bị trùng trên cùng sản phẩm.' });
      }
      seenUnitNames.add(unitNameKey);
      const unitBarcode = trimText(u.barcode);
      if (unitBarcode) {
        if (!DIGITS_ONLY_REGEX.test(unitBarcode)) {
          return res.status(400).json({ message: `Barcode đơn vị "${unitName}" chỉ được nhập số.` });
        }
        if (seenUnitBarcodes.has(unitBarcode)) {
          return res.status(400).json({ message: 'Barcode đơn vị bị trùng trong cùng sản phẩm.' });
        }
        seenUnitBarcodes.add(unitBarcode);
      }
    }

    const allBarcodesToCheck = new Set([trimmedBarcode, ...selling_units.map((u) => trimText(u.barcode))].filter(Boolean));
    for (const bc of allBarcodesToCheck) {
      const dup = await findBarcodeDuplicate({ barcode: bc, storeId: storeFilter.storeId || null });
      if (dup) {
        return res.status(409).json({
          message: `Barcode "${bc}" đã tồn tại trong cửa hàng.`,
          code: 'BARCODE_ALREADY_EXISTS',
        });
      }
    }

    const baseUnit = selling_units.find((u) => u.ratio === 1);
    const baseUnitPrice = baseUnit ? baseUnit.sale_price : (Number(sale_price) || 0);

    let image_urls = Array.isArray(bodyImageUrls)
      ? bodyImageUrls.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 3)
      : [];
    if (image_urls.length === 0) image_urls = undefined;

    let expiry_date;
    if (bodyExpiry) {
      const d = new Date(bodyExpiry);
      if (!Number.isNaN(d.getTime())) expiry_date = d;
    }

    const supplier_id = bodySupplierId && mongoose.isValidObjectId(bodySupplierId)
      ? bodySupplierId
      : undefined;

    const doc = await ProductRequest.create({
      category_id: category_id && mongoose.isValidObjectId(category_id) ? category_id : undefined,
      storeId: storeFilter.storeId || undefined,
      name: trimmedName,
      sku: trimmedSku,
      barcode: trimmedBarcode || undefined,
      supplier_id,
      image_urls,
      expiry_date,
      cost_price: Number(cost_price || 0),
      sale_price: baseUnitPrice,
      stock_qty: Number(stock_qty || 0),
      reorder_level: Number(reorder_level || 0),
      base_unit: base,
      selling_units,
      requested_by: req.user.id,
      status: 'pending',
      note: note ? String(note).trim() : undefined
    });
    await notifyManagersInStore({
      storeId: doc.storeId ? String(doc.storeId) : null,
      type: 'product_request_pending',
      title: 'Có yêu cầu tạo sản phẩm mới',
      message: `Yêu cầu tạo sản phẩm "${doc.name}" đang chờ duyệt.`,
      relatedEntity: 'product_request',
      relatedId: doc._id,
    }).catch(() => {});
    await emitManagerBadgeRefresh({ storeId: doc.storeId ? String(doc.storeId) : null });

    return res.status(201).json({ productRequest: normalizeProduct(doc.toObject()) });
  } catch (err) {
    console.error('ProductRequest create error:', err);
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ message: `${field} already exists in requests format` });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/product-requests (staff, manager, admin)
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const { q = '', page = '1', limit = '20', status } = req.query;
    const query = String(q || '').trim();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const filter = getStoreScopeFilter(req);
    if (filter == null) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
    }

    if (status) {
      filter.status = status;
    }
    if (query) {
      const re = new RegExp(escapeRegex(query), 'i');
      filter.$or = [{ name: re }, { sku: re }, { barcode: re }];
    }

    const total = await ProductRequest.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const requests = await ProductRequest.find(filter)
      .populate('requested_by', 'fullName email role')
      .populate('approved_by', 'fullName email role')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const normalized = requests.map(normalizeProduct);

    return res.json({
      productRequests: normalized,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    console.error('List product requests error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/product-requests/:id (manager, admin)
router.get('/:id', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }
    const scope = getStoreScopeFilter(req);
    if (scope == null) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
    }
    const request = await ProductRequest.findOne({ _id: id, ...scope })
      .populate('requested_by', 'name email role')
      .populate('approved_by', 'name email role')
      .lean();
    if (!request) return res.status(404).json({ message: 'Product request not found' });
    return res.json({ productRequest: normalizeProduct(request) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/product-requests/:id/approve (manager, admin)
router.post('/:id/approve', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const scope = getStoreScopeFilter(req);
    if (scope == null) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
    }
    const request = await ProductRequest.findOne({ _id: id, ...scope });
    if (!request) return res.status(404).json({ message: 'Product request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${request.status}` });
    }

    // Check if SKU exists in the specific store
    const existingProduct = await Product.findOne({ sku: request.sku, storeId: request.storeId || null });
    if (existingProduct) {
      return res.status(409).json({ message: 'sku already exists in this store' });
    }

    const pendingBarcodes = new Set([
      trimText(request.barcode),
      ...((request.selling_units || []).map((u) => trimText(u?.barcode))),
    ].filter(Boolean));
    for (const bc of pendingBarcodes) {
      const dup = await findBarcodeDuplicate({ barcode: bc, storeId: request.storeId || null });
      if (dup) {
        return res.status(409).json({
          message: `Barcode "${bc}" đã tồn tại trong cửa hàng.`,
          code: 'BARCODE_ALREADY_EXISTS',
        });
      }
    }

    // Create product
    const newProduct = await Product.create({
      category_id: request.category_id,
      storeId: request.storeId,
      supplier_id: request.supplier_id,
      name: request.name,
      sku: request.sku,
      barcode: request.barcode,
      image_urls: Array.isArray(request.image_urls) && request.image_urls.length ? request.image_urls : [],
      expiry_date: request.expiry_date,
      cost_price: request.cost_price,
      sale_price: request.sale_price,
      stock_qty: request.stock_qty,
      reorder_level: request.reorder_level,
      base_unit: request.base_unit,
      selling_units: request.selling_units,
      status: 'active'
    });

    await syncProductUnitsFromRequest(newProduct, request);

    // Update request status
    request.status = 'approved';
    request.approved_by = req.user.id;
    request.updated_at = new Date();
    await request.save();
    await emitManagerBadgeRefresh({ storeId: request.storeId ? String(request.storeId) : null });

    return res.json({ message: 'Product approved and created successfully', product: normalizeProduct(newProduct.toObject()) });
  } catch (err) {
    console.error('Approve error:', err);
    return res.status(500).json({ message: 'Server error during approval' });
  }
});

// POST /api/product-requests/:id/reject (manager, admin)
router.post('/:id/reject', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const scope = getStoreScopeFilter(req);
    if (scope == null) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
    }
    const request = await ProductRequest.findOne({ _id: id, ...scope });
    if (!request) return res.status(404).json({ message: 'Product request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${request.status}` });
    }

    // Update request status
    request.status = 'rejected';
    request.approved_by = req.user.id;
    request.updated_at = new Date();
    await request.save();
    await emitManagerBadgeRefresh({ storeId: request.storeId ? String(request.storeId) : null });

    return res.json({ message: 'Product request rejected successfully', productRequest: normalizeProduct(request.toObject()) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
