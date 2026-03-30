const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Product = require('../models/Product');
const ProductPriceHistory = require('../models/ProductPriceHistory');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  parseExcelToMatrix,
  mapRowsFromMatrix,
  generateAutoSku,
  buildTemplateBuffer,
} = require('../utils/productImport');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls');
    if (ok) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file .xlsx hoặc .xls'));
  },
});

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseOptionalDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Ngày hết hạn chỉ được từ hôm nay trở đi (theo ngày lịch) */
function validateExpiryDateForWrite(value) {
  if (value === undefined || value === null || value === '') {
    return { ok: true, date: undefined };
  }
  const d = parseOptionalDate(value);
  if (!d) return { ok: false, message: 'Ngày hết hạn không hợp lệ' };
  const today = startOfDay(new Date());
  const exp = startOfDay(d);
  if (exp.getTime() < today.getTime()) {
    return { ok: false, message: 'Ngày hết hạn phải từ hôm nay trở đi (không chọn ngày quá khứ).' };
  }
  return { ok: true, date: d };
}

async function findBarcodeDuplicate({ barcode, storeId, excludeId }) {
  const b = String(barcode || '').trim();
  if (!b) return null;
  const filter = { barcode: b };
  if (storeId) filter.storeId = storeId;
  else filter.storeId = null;
  if (excludeId && mongoose.isValidObjectId(excludeId)) filter._id = { $ne: excludeId };
  return Product.findOne(filter).select('_id barcode sku name').lean();
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

async function findSkuDuplicate({ sku, storeId, excludeId }) {
  const filter = { sku: String(sku || '').trim() };
  if (storeId) filter.storeId = storeId;
  else filter.storeId = null;
  if (excludeId && mongoose.isValidObjectId(excludeId)) filter._id = { $ne: excludeId };
  return Product.findOne(filter).select('_id sku storeId').lean();
}

/**
 * Import merge: match by product name first (case-insensitive, exact string — chủ hàng thường nhớ đúng tên),
 * then by SKU if no name match (hữu ích khi đã có mã trên hệ thống).
 */
async function findExistingProductForImport({ sku, name, storeId }) {
  const storeFilter = storeId ? { storeId } : { storeId: null };
  const trimmedName = String(name || '').trim();
  if (trimmedName) {
    const byName = await Product.findOne({
      ...storeFilter,
      name: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i'),
    });
    if (byName) return byName;
  }
  const trimmedSku = String(sku || '').trim();
  if (trimmedSku) {
    const bySku = await Product.findOne({ ...storeFilter, sku: trimmedSku });
    if (bySku) return bySku;
  }
  return null;
}

async function logPriceChange({
  productId,
  storeId,
  changedBy,
  source,
  oldCost,
  newCost,
  oldSale,
  newSale,
}) {
  if (Number(oldCost) === Number(newCost) && Number(oldSale) === Number(newSale)) return;
  await ProductPriceHistory.create({
    product_id: productId,
    storeId: storeId || null,
    changed_by: changedBy,
    source,
    old_cost_price: Number(oldCost) || 0,
    new_cost_price: Number(newCost) || 0,
    old_sale_price: Number(oldSale) || 0,
    new_sale_price: Number(newSale) || 0,
    changed_at: new Date(),
  });
}

function getRoleStoreFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  // Nhận diện đủ role cũ (backward compat) và role mới
  const isStoreScopedRole = ['manager', 'staff', 'warehouse_staff', 'sales_staff'].includes(role);
  if (!isStoreScopedRole) return {};
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId) return null;
  return { storeId };
}

// POST /api/products  (manager, admin)
router.post('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const {
      category_id,
      supplier_id,
      name,
      sku,
      barcode,
      cost_price,
      sale_price,
      stock_qty,
      reorder_level,
      expiry_date,
      base_unit,
      selling_units: bodyUnits,
      status,
    } = req.body || {};
    const role = String(req.user?.role || '').toLowerCase();
    const requesterStoreId = req.user?.storeId ? String(req.user.storeId) : null;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (!sku || !String(sku).trim()) {
      return res.status(400).json({ message: 'sku is required' });
    }

    const base = base_unit ? String(base_unit).trim() : 'Cái';
    let selling_units = Array.isArray(bodyUnits) && bodyUnits.length > 0
      ? bodyUnits.map((u) => ({
          name: String(u.name || '').trim() || base,
          ratio: Number(u.ratio) > 0 ? Number(u.ratio) : 1,
          sale_price: Number(u.sale_price) >= 0 ? Number(u.sale_price) : 0,
        }))
      : [{ name: base, ratio: 1, sale_price: Number(sale_price) >= 0 ? Number(sale_price) : 0 }];

    const hasBase = selling_units.some((u) => u.ratio === 1);
    if (!hasBase) {
      selling_units = [{ name: base, ratio: 1, sale_price: selling_units[0] ? selling_units[0].sale_price : 0 }, ...selling_units];
    }

    const baseUnit = selling_units.find((u) => u.ratio === 1);
    const baseUnitPrice = baseUnit ? baseUnit.sale_price : (Number(sale_price) || 0);
    const isPlatform = role === 'admin';
    const resolvedStoreId = isPlatform
      ? (req.body?.storeId && mongoose.isValidObjectId(req.body.storeId) ? req.body.storeId : undefined)
      : requesterStoreId;
    if (!isPlatform && !resolvedStoreId) {
      return res.status(403).json({
        message: 'Manager chưa có cửa hàng. Vui lòng đăng ký cửa hàng trước khi tạo sản phẩm.',
        code: 'STORE_REQUIRED',
      });
    }

    const duplicate = await findSkuDuplicate({ sku, storeId: resolvedStoreId });
    if (duplicate) {
      return res.status(409).json({ message: 'SKU đã tồn tại trong cửa hàng này' });
    }

    const expCheck = validateExpiryDateForWrite(expiry_date);
    if (!expCheck.ok) {
      return res.status(400).json({ message: expCheck.message });
    }

    const barcodeTrim = barcode ? String(barcode).trim() : '';
    if (barcodeTrim) {
      const dupBc = await findBarcodeDuplicate({ barcode: barcodeTrim, storeId: resolvedStoreId });
      if (dupBc) {
        return res.status(409).json({ message: 'Barcode đã tồn tại cho sản phẩm khác trong cửa hàng này' });
      }
    }

    const doc = await Product.create({
      category_id: category_id && mongoose.isValidObjectId(category_id) ? category_id : undefined,
      supplier_id: supplier_id && mongoose.isValidObjectId(supplier_id) ? supplier_id : undefined,
      storeId: resolvedStoreId,
      name: String(name).trim(),
      sku: String(sku).trim(),
      barcode: barcodeTrim || undefined,
      cost_price: Number(cost_price || 0),
      sale_price: baseUnitPrice,
      stock_qty: Number(stock_qty || 0),
      reorder_level: Number(reorder_level || 0),
      expiry_date: expCheck.date,
      base_unit: base,
      selling_units,
      status: status === 'inactive' ? 'inactive' : 'active',
    });

    return res.status(201).json({ product: normalizeProduct(doc.toObject()) });
  } catch (err) {
    if (err?.code === 11000) {
      const keys = err.keyPattern || {};
      if (keys.barcode) {
        return res.status(409).json({ message: 'Barcode đã tồn tại cho sản phẩm khác trong cửa hàng này' });
      }
      return res.status(409).json({ message: 'SKU đã tồn tại trong cửa hàng này' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products?q=...&page=1&limit=20  (staff, manager, admin)
router.get('/', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const { q = '', page = '1', limit = '20' } = req.query;
    const query = String(q || '').trim();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const filter = getRoleStoreFilter(req);
    if (filter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    if (query) {
      const re = new RegExp(escapeRegex(query), 'i');
      filter.$or = [{ name: re }, { sku: re }, { barcode: re }];
    }

    const total = await Product.countDocuments(filter);
    const skip = (pageNum - 1) * limitNum;
    const products = await Product.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const normalized = products.map(normalizeProduct);

    return res.json({
      products: normalized,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products/import/template — download Excel template (manager, admin)
router.get('/import/template', requireAuth, requireRole(['manager', 'admin']), (req, res) => {
  try {
    const buf = buildTemplateBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="mau-import-san-pham.xlsx"');
    return res.send(buf);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/products/import/preview — parse Excel, validate rows (manager, admin)
router.post(
  '/import/preview',
  requireAuth,
  requireRole(['manager', 'admin']),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Lỗi upload file' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'Vui lòng chọn file Excel (.xlsx).' });
      }
      const parsed = parseExcelToMatrix(req.file.buffer);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      const mapped = mapRowsFromMatrix(parsed.rows);
      if (mapped.error) return res.status(400).json({ message: mapped.error });

      const role = String(req.user?.role || '').toLowerCase();
      const requesterStoreId = req.user?.storeId ? String(req.user.storeId) : null;
      const resolvedStoreId = role === 'admin' ? undefined : requesterStoreId;

      const rows = mapped.mapped.map((r) => ({
        row: r.row,
        name: r.name,
        cost_price: r.cost_price,
        sale_price: r.sale_price,
        sku: r.sku || '',
        stock_qty: r.stock_qty,
        base_unit: r.base_unit,
        barcode: r.barcode || '',
        valid: r.errors.length === 0,
        errors: r.errors,
      }));

      // So sánh giá với sản phẩm đang có trong DB để cảnh báo thay đổi giá
      const price_changes = [];
      for (const r of rows) {
        if (!r.valid) continue;
        const existing = await findExistingProductForImport({
          sku: r.sku,
          name: r.name,
          storeId: resolvedStoreId,
        });
        if (!existing) continue;
        const oldCost = Number(existing.cost_price) || 0;
        const oldSale = Number(existing.sale_price) || 0;
        const newCost = Number(r.cost_price) || 0;
        const newSale = Number(r.sale_price) || 0;
        if (oldCost !== newCost || oldSale !== newSale) {
          price_changes.push({
            row: r.row,
            name: existing.name,
            sku: existing.sku,
            old_cost_price: oldCost,
            new_cost_price: newCost,
            old_sale_price: oldSale,
            new_sale_price: newSale,
            cost_changed: oldCost !== newCost,
            sale_changed: oldSale !== newSale,
          });
        }
      }

      return res.json({
        rows,
        totalRows: rows.length,
        validCount: rows.filter((x) => x.valid).length,
        invalidCount: rows.filter((x) => !x.valid).length,
        price_changes,
        has_price_changes: price_changes.length > 0,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

// POST /api/products/import/commit — body: { rows: [...], storeId?, confirmPriceChanges?: boolean }
router.post('/import/commit', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { rows, confirmPriceChanges } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu để import.' });
    }
    if (rows.length > 2000) {
      return res.status(400).json({ message: 'Vượt quá số dòng cho phép (tối đa 2000).' });
    }

    const role = String(req.user?.role || '').toLowerCase();
    const requesterStoreId = req.user?.storeId ? String(req.user.storeId) : null;
    const isPlatformImport = role === 'admin';
    const resolvedStoreId = isPlatformImport
      ? req.body?.storeId && mongoose.isValidObjectId(req.body.storeId)
        ? req.body.storeId
        : undefined
      : requesterStoreId;
    if (!isPlatformImport && !resolvedStoreId) {
      return res.status(403).json({
        message: 'Manager chưa có cửa hàng. Vui lòng đăng ký cửa hàng trước khi import.',
        code: 'STORE_REQUIRED',
      });
    }

    // Kiểm tra thay đổi giá — nếu có mà chưa xác nhận thì chặn lại
    if (!confirmPriceChanges) {
      const pendingChanges = [];
      for (const raw of rows) {
        const name = String(raw.name || '').trim();
        const existing = await findExistingProductForImport({
          sku: raw.sku != null ? String(raw.sku).trim() : '',
          name,
          storeId: resolvedStoreId,
        });
        if (!existing) continue;
        const oldCost = Number(existing.cost_price) || 0;
        const oldSale = Number(existing.sale_price) || 0;
        const newCost = Number(raw.cost_price) || 0;
        const newSale = Number(raw.sale_price) || 0;
        if (oldCost !== newCost || oldSale !== newSale) {
          pendingChanges.push({
            name: existing.name,
            sku: existing.sku,
            old_cost_price: oldCost,
            new_cost_price: newCost,
            old_sale_price: oldSale,
            new_sale_price: newSale,
          });
        }
      }
      if (pendingChanges.length > 0) {
        return res.status(409).json({
          code: 'PRICE_CHANGE_CONFIRMATION_REQUIRED',
          message: `Có ${pendingChanges.length} sản phẩm bị thay đổi giá. Vui lòng xác nhận trước khi import.`,
          price_changes: pendingChanges,
        });
      }
    }

    const base = 'Cái';
    const created = [];
    const updated = [];
    const failed = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rowLabel = Number(raw.row) || i + 1;
      const name = String(raw.name || '').trim();
      const cost_price = Number(raw.cost_price);
      const sale_price = Number(raw.sale_price);
      const explicitSku = raw.sku != null ? String(raw.sku).trim() : '';
      const stockRaw = Number(raw.stock_qty ?? 0);
      const stock_qty = Number.isFinite(stockRaw) ? Math.round(stockRaw) : NaN;
      const base_unit = raw.base_unit ? String(raw.base_unit).trim() : 'Cái';
      const barcodeIn = raw.barcode != null ? String(raw.barcode).trim() : '';

      const rowErrors = [];
      if (!name) rowErrors.push('Thiếu tên sản phẩm');
      if (Number.isNaN(cost_price) || cost_price < 0) rowErrors.push('Giá gốc không hợp lệ');
      if (Number.isNaN(sale_price) || sale_price < 0) rowErrors.push('Giá bán không hợp lệ');
      if (Number.isNaN(stock_qty) || stock_qty < 0) rowErrors.push('Tồn kho không hợp lệ');

      if (rowErrors.length) {
        failed.push({ row: rowLabel, errors: rowErrors });
        continue;
      }

      try {
        const existing = await findExistingProductForImport({
          sku: explicitSku,
          name,
          storeId: resolvedStoreId,
        });

        if (existing) {
          const oldCost = Number(existing.cost_price) || 0;
          const oldSale = Number(existing.sale_price) || 0;
          if (barcodeIn) {
            const dupBc = await findBarcodeDuplicate({
              barcode: barcodeIn,
              storeId: resolvedStoreId,
              excludeId: existing._id,
            });
            if (dupBc) {
              failed.push({
                row: rowLabel,
                errors: [`Barcode "${barcodeIn}" đã gán cho sản phẩm khác trong cửa hàng.`],
              });
              continue;
            }
          }
          const prevQty = Number(existing.stock_qty) || 0;
          existing.stock_qty = prevQty + stock_qty;
          existing.cost_price = cost_price;
          existing.sale_price = sale_price;
          existing.base_unit = base_unit || base;
          existing.selling_units = [{ name: base_unit || base, ratio: 1, sale_price }];
          if (barcodeIn) {
            existing.barcode = barcodeIn;
          }
          existing.updated_at = new Date();
          await existing.save();
          await logPriceChange({
            productId: existing._id,
            storeId: existing.storeId || resolvedStoreId || null,
            changedBy: req.user?.id,
            source: 'import_excel',
            oldCost,
            newCost: existing.cost_price,
            oldSale,
            newSale: existing.sale_price,
          });
          updated.push({
            row: rowLabel,
            action: 'updated',
            product: normalizeProduct(existing.toObject()),
          });
          continue;
        }

        const sku = explicitSku || generateAutoSku(resolvedStoreId, rowLabel);
        const dupNew = await findSkuDuplicate({ sku, storeId: resolvedStoreId });
        if (dupNew) {
          failed.push({
            row: rowLabel,
            errors: [
              `SKU "${sku}" đã tồn tại nhưng không khớp tên sản phẩm đã nhập. Sửa SKU hoặc tên cho đúng với sản phẩm cũ.`,
            ],
          });
          continue;
        }

        if (barcodeIn) {
          const dupBc = await findBarcodeDuplicate({ barcode: barcodeIn, storeId: resolvedStoreId });
          if (dupBc) {
            failed.push({
              row: rowLabel,
              errors: [`Barcode "${barcodeIn}" đã tồn tại cho sản phẩm khác trong cửa hàng.`],
            });
            continue;
          }
        }

        const selling_units = [{ name: base_unit || base, ratio: 1, sale_price }];
        const doc = await Product.create({
          storeId: resolvedStoreId,
          name,
          sku,
          barcode: barcodeIn || undefined,
          cost_price,
          sale_price,
          stock_qty,
          reorder_level: 0,
          base_unit: base_unit || base,
          selling_units,
          status: 'active',
        });
        created.push({ row: rowLabel, action: 'created', product: normalizeProduct(doc.toObject()) });
      } catch (e) {
        if (e?.code === 11000) {
          const keys = e.keyPattern || {};
          if (keys.barcode) {
            failed.push({ row: rowLabel, errors: ['Barcode trùng với sản phẩm khác trong cửa hàng.'] });
          } else {
            failed.push({ row: rowLabel, errors: ['SKU trùng (database). Thử lại hoặc đổi SKU.'] });
          }
        } else {
          failed.push({ row: rowLabel, errors: [e.message || 'Lỗi lưu'] });
        }
      }
    }

    return res.json({
      createdCount: created.length,
      updatedCount: updated.length,
      failedCount: failed.length,
      created,
      updated,
      failed,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products/:id  (staff, manager, admin)
router.get('/:id', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }
    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    const product = await Product.findOne({ _id: id, ...storeFilter })
      .populate('supplier_id', 'name phone email')
      .lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ product: normalizeProduct(product) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/products/:id  (manager, admin)
router.put('/:id', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }
    const {
      category_id,
      supplier_id,
      name,
      sku,
      barcode,
      cost_price,
      sale_price,
      stock_qty,
      reorder_level,
      expiry_date,
      base_unit,
      selling_units: bodyUnits,
      status,
    } = req.body || {};

    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    const product = await Product.findOne({ _id: id, ...storeFilter });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const oldCost = Number(product.cost_price) || 0;
    const oldSale = Number(product.sale_price) || 0;

    if (expiry_date !== undefined) {
      const expCheck = validateExpiryDateForWrite(expiry_date);
      if (!expCheck.ok) {
        return res.status(400).json({ message: expCheck.message });
      }
      product.expiry_date = expCheck.date != null ? expCheck.date : null;
    }

    if (barcode !== undefined) {
      const bc = barcode ? String(barcode).trim() : '';
      if (bc) {
        const dupB = await findBarcodeDuplicate({ barcode: bc, storeId: product.storeId, excludeId: id });
        if (dupB) {
          return res.status(409).json({ message: 'Barcode đã tồn tại cho sản phẩm khác trong cửa hàng này' });
        }
      }
      product.barcode = bc || undefined;
    }

    if (name !== undefined) product.name = String(name).trim();
    if (sku !== undefined) product.sku = String(sku).trim();
    if (cost_price !== undefined) product.cost_price = Number(cost_price) || 0;
    if (stock_qty !== undefined) product.stock_qty = Number(stock_qty) || 0;
    if (reorder_level !== undefined) product.reorder_level = Number(reorder_level) || 0;
    if (base_unit !== undefined) product.base_unit = base_unit ? String(base_unit).trim() : 'Cái';
    if (status !== undefined) product.status = status === 'inactive' ? 'inactive' : 'active';
    if (category_id !== undefined) {
      product.category_id = category_id && mongoose.isValidObjectId(category_id) ? category_id : null;
    }
    if (supplier_id !== undefined) {
      product.supplier_id = supplier_id && mongoose.isValidObjectId(supplier_id) ? supplier_id : null;
    }
    if (sku !== undefined) {
      const duplicate = await findSkuDuplicate({ sku, storeId: product.storeId, excludeId: id });
      if (duplicate) {
        return res.status(409).json({ message: 'SKU đã tồn tại trong cửa hàng này' });
      }
    }

    if (Array.isArray(bodyUnits) && bodyUnits.length > 0) {
      const base = product.base_unit || 'Cái';
      const units = bodyUnits.map((u) => ({
        name: String(u.name || '').trim() || base,
        ratio: Number(u.ratio) > 0 ? Number(u.ratio) : 1,
        sale_price: Number(u.sale_price) >= 0 ? Number(u.sale_price) : 0,
      }));
      const hasBase = units.some((u) => u.ratio === 1);
      product.selling_units = hasBase ? units : [{ name: base, ratio: 1, sale_price: units[0]?.sale_price ?? 0 }, ...units];
      const baseUnitPrice = product.selling_units.find((u) => u.ratio === 1)?.sale_price ?? 0;
      product.sale_price = baseUnitPrice;
    } else if (sale_price !== undefined) {
      product.sale_price = Number(sale_price) || 0;
      product.selling_units = [{ name: product.base_unit || 'Cái', ratio: 1, sale_price: product.sale_price }];
    }
    product.updated_at = new Date();
    await product.save();
    await logPriceChange({
      productId: product._id,
      storeId: product.storeId || null,
      changedBy: req.user?.id,
      source: 'manual_update',
      oldCost,
      newCost: product.cost_price,
      oldSale,
      newSale: product.sale_price,
    });

    return res.json({ product: normalizeProduct(product.toObject()) });
  } catch (err) {
    if (err?.code === 11000) {
      const keys = err.keyPattern || {};
      if (keys.barcode) {
        return res.status(409).json({ message: 'Barcode đã tồn tại cho sản phẩm khác trong cửa hàng này' });
      }
      return res.status(409).json({ message: 'SKU đã tồn tại trong cửa hàng này' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/products/:id/status  (manager, admin) - body: { status: 'active' | 'inactive' }
router.patch('/:id/status', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }
    const { status } = req.body || {};
    const newStatus = status === 'inactive' ? 'inactive' : 'active';

    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }
    const product = await Product.findOneAndUpdate(
      { _id: id, ...storeFilter },
      { status: newStatus, updated_at: new Date() },
      { new: true }
    ).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ product: normalizeProduct(product) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

