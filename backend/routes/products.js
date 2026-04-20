const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Product = require('../models/Product');
const ProductUnit = require('../models/ProductUnit');
const StockBatch = require('../models/StockBatch');
const ProductPriceHistory = require('../models/ProductPriceHistory');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ensureCloudinaryConfigured, hasCloudinaryConfig } = require('../services/cloudinary');
const {
  parseExcelToMatrix,
  mapRowsFromMatrix,
  generateAutoSku,
  buildTemplateBuffer,
} = require('../utils/productImport');

const GoodsReceipt = require('../models/GoodsReceipt');
const SupplierPayable = require('../models/SupplierPayable');
const SupplierPayment = require('../models/SupplierPayment');
const SupplierPaymentAllocation = require('../models/SupplierPaymentAllocation');
const Supplier = require('../models/Supplier');
const { adjustStockFIFO } = require('../utils/inventoryUtils');

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

const uploadProductImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024,
    files: 3,
  },
  fileFilter: (req, file, cb) => {
    const ok = String(file.mimetype || '').startsWith('image/');
    if (ok) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
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

const TEXT_NO_SPECIAL_REGEX = /^[\p{L}\p{N}\s]+$/u;
const PRODUCT_NAME_REGEX = /^[\p{L}\p{N}\s,]+$/u;
const SKU_REGEX = /^[\p{L}\p{N},]+$/u;
const DIGITS_ONLY_REGEX = /^\d+$/;

function trimText(value) {
  return String(value || '').trim();
}

function isValidNoSpecialText(value) {
  return TEXT_NO_SPECIAL_REGEX.test(trimText(value));
}

function isValidProductName(value) {
  return PRODUCT_NAME_REGEX.test(trimText(value));
}

function parseNonNegativeNumber(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeImageUrls(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function uploadBufferToCloudinary(buffer, folder = 'ims/products') {
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

const LOCAL_PRODUCT_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'products');

async function ensureLocalUploadDir() {
  await fs.promises.mkdir(LOCAL_PRODUCT_UPLOAD_DIR, { recursive: true });
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
  const fullPath = path.join(LOCAL_PRODUCT_UPLOAD_DIR, fileName);
  await fs.promises.writeFile(fullPath, file.buffer);
  const origin = `${req.protocol}://${req.get('host')}`;
  return {
    secure_url: `${origin}/uploads/products/${fileName}`,
    public_id: `local/products/${fileName}`,
  };
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
  const inProduct = await Product.findOne(filter).select('_id barcode sku name').lean();
  if (inProduct) return inProduct;
  const unitFilter = { barcode: b };
  if (storeId) unitFilter.storeId = storeId;
  else unitFilter.storeId = null;
  if (excludeId && mongoose.isValidObjectId(excludeId)) unitFilter.product_id = { $ne: excludeId };
  const unitDup = await ProductUnit.findOne(unitFilter).select('_id barcode product_id unit_name').lean();
  if (!unitDup) return null;
  const ownerProduct = await Product.findOne({
    _id: unitDup.product_id,
    ...(storeId ? { storeId } : { storeId: null }),
  })
    .select('_id name sku')
    .lean();
  // Ignore stale/orphan unit rows to avoid false duplicate errors.
  if (!ownerProduct) return null;
  return {
    ...unitDup,
    product_name: ownerProduct.name,
    product_sku: ownerProduct.sku,
  };
}

async function cleanupOrphanProductUnitsByBarcodes({ barcodes, storeId, session = null }) {
  const normalized = [...new Set((barcodes || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (normalized.length === 0) return;
  const unitFilter = {
    barcode: { $in: normalized },
    ...(storeId ? { storeId } : { storeId: null }),
  };
  const unitRows = await ProductUnit.find(unitFilter).select('_id product_id').lean();
  if (!unitRows.length) return;
  const productIds = [...new Set(unitRows.map((r) => String(r.product_id || '')).filter(Boolean))]
    .filter((id) => mongoose.isValidObjectId(id));
  const ownerRows = productIds.length
    ? await Product.find({
      _id: { $in: productIds },
      ...(storeId ? { storeId } : { storeId: null }),
    }).select('_id').lean()
    : [];
  const ownerSet = new Set(ownerRows.map((r) => String(r._id)));
  const staleIds = unitRows
    .filter((r) => !ownerSet.has(String(r.product_id || '')))
    .map((r) => r._id);
  if (staleIds.length > 0) {
    await ProductUnit.deleteMany(
      { _id: { $in: staleIds } },
      session ? { session } : undefined
    );
  }
}


function normalizeProduct(p) {
  if (!p) return p;
  const base = p.base_unit || 'Cái';
  const imageUrls = normalizeImageUrls(p.image_urls);
  const units = p.selling_units && p.selling_units.length > 0
    ? p.selling_units
    : [{ name: base, ratio: 1, sale_price: p.sale_price != null ? p.sale_price : 0 }];
  const baseUnit = units.find((u) => u.ratio === 1) || units[0];
  return {
    ...p,
    image_urls: imageUrls,
    selling_units: units,
    sale_price: baseUnit ? baseUnit.sale_price : (p.sale_price || 0),
  };
}

async function findSkuDuplicate({ sku, storeId, excludeId }) {
  const filter = { sku: String(sku || '').trim() };
  if (storeId) filter.storeId = storeId;
  else filter.storeId = null;
  if (excludeId && mongoose.isValidObjectId(excludeId)) filter._id = { $ne: excludeId };
  return Product.findOne(filter).select('_id sku storeId').lean();
}

async function syncBaseProductUnit(productDoc, session = null) {
  if (!productDoc?._id) return;
  const baseName = String(productDoc.base_unit || 'Cái').trim() || 'Cái';
  const basePrice = Math.round(Number(productDoc.sale_price) || 0);
  const baseBarcode = String(productDoc.barcode || '').trim() || undefined;
  await ProductUnit.findOneAndUpdate(
    { product_id: productDoc._id, is_base: true },
    {
      $set: {
        storeId: productDoc.storeId || null,
        unit_name: baseName,
        exchange_value: 1,
        price: basePrice,
        barcode: baseBarcode,
        is_base: true,
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true, new: true, ...(session ? { session } : {}) }
  );
}

async function syncProductUnitsFromProduct(productDoc, session = null) {
  if (!productDoc?._id) return;
  const baseName = String(productDoc.base_unit || 'Cái').trim() || 'Cái';
  const list = Array.isArray(productDoc.selling_units) && productDoc.selling_units.length > 0
    ? productDoc.selling_units
    : [{ name: baseName, ratio: 1, sale_price: productDoc.sale_price || 0 }];
  const normalizedNames = list.map((u) => String(u.name || '').trim() || baseName);
  const explicitBaseByName = normalizedNames.find((n) => n === baseName) || null;
  const explicitBaseByRatio = !explicitBaseByName
    ? (list.find((u) => Number(u.ratio) === 1)?.name ? String(list.find((u) => Number(u.ratio) === 1).name).trim() : null)
    : null;
  const resolvedBaseName = explicitBaseByName || explicitBaseByRatio || normalizedNames[0] || baseName;
  const bulkOps = list.map((u) => {
    const name = String(u.name || '').trim() || baseName;
    const ratio = Number(u.ratio) > 0 ? Number(u.ratio) : 1;
    const isBase = name === resolvedBaseName;
    const unitBarcode = String(u.barcode || '').trim();
    const resolvedBarcode = unitBarcode || (isBase ? (String(productDoc.barcode || '').trim() || undefined) : undefined);
    return {
      updateOne: {
        filter: { product_id: productDoc._id, unit_name: name },
        update: {
          $set: {
            storeId: productDoc.storeId || null,
            unit_name: name,
            exchange_value: ratio,
            price: Math.round(Number(u.sale_price) || 0),
            barcode: resolvedBarcode,
            is_base: isBase,
            updated_at: new Date(),
          },
          $setOnInsert: { created_at: new Date() },
        },
        upsert: true,
      },
    };
  });
  if (bulkOps.length > 0) {
    await ProductUnit.bulkWrite(bulkOps, { ordered: false, ...(session ? { session } : {}) });
  }
  await ProductUnit.deleteMany(
    {
      product_id: productDoc._id,
      unit_name: { $nin: list.map((u) => String(u.name || '').trim() || baseName) },
    },
    session ? { session } : undefined
  );
  await syncBaseProductUnit(productDoc, session);
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
  sourceNote,
  oldCost,
  newCost,
  oldSale,
  newSale,
}) {
  const safeOldCost = Math.round(Number(oldCost) || 0);
  const safeNewCost = Math.round(Number(newCost) || 0);
  const safeOldSale = Math.round(Number(oldSale) || 0);
  const safeNewSale = Math.round(Number(newSale) || 0);
  if (safeOldCost === safeNewCost && safeOldSale === safeNewSale) return;
  await ProductPriceHistory.create({
    product_id: productId,
    storeId: storeId || null,
    changed_by: changedBy,
    source,
    source_note: sourceNote ? String(sourceNote).trim() : undefined,
    old_cost_price: safeOldCost,
    new_cost_price: safeNewCost,
    old_sale_price: safeOldSale,
    new_sale_price: safeNewSale,
    changed_at: new Date(),
  });
}

function normalizeUnitInput(unit = {}, fallbackBaseName = 'Cái') {
  const unitName = trimText(unit.unit_name || unit.name || fallbackBaseName);
  const exchangeValueRaw = Number(unit.exchange_value ?? unit.ratio ?? 1);
  const exchangeValue = Number.isFinite(exchangeValueRaw) && exchangeValueRaw > 0 ? exchangeValueRaw : 1;
  const priceRaw = Number(unit.price ?? unit.sale_price ?? 0);
  const price = Number.isFinite(priceRaw) && priceRaw >= 0 ? Math.round(priceRaw) : 0;
  const barcode = trimText(unit.barcode) || undefined;
  const isBase = Boolean(unit.is_base) || exchangeValue === 1;
  return { unit_name: unitName, exchange_value: exchangeValue, price, barcode, is_base: isBase };
}

function getRoleStoreFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  const isStoreScopedRole = ['manager', 'staff'].includes(role);
  if (!isStoreScopedRole) return {};
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId) return null;
  return { storeId };
}

async function getBaseUnitOfProduct(product) {
  if (!product?._id) return null;
  const base = await ProductUnit.findOne({ product_id: product._id, is_base: true }).lean();
  if (base) return base;
  return {
    _id: null,
    unit_name: product.base_unit || 'Cái',
    exchange_value: 1,
    price: Math.round(Number(product.sale_price) || 0),
    barcode: product.barcode || undefined,
    is_base: true,
  };
}

// POST /api/products/upload-images (staff, manager, admin) - tối đa 3 ảnh
// staff: ảnh kèm yêu cầu đăng ký sản phẩm (Warehouse); manager/admin: tạo/sửa sản phẩm trực tiếp
router.post(
  '/upload-images',
  requireAuth,
  requireRole(['staff', 'manager', 'admin']),
  (req, res, next) => {
    uploadProductImages.array('images', 3)(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Lỗi upload ảnh' });
      next();
    });
  },
  async (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ message: 'Vui lòng chọn ít nhất 1 ảnh' });
      }
      if (files.length > 3) {
        return res.status(400).json({ message: 'Chỉ được upload tối đa 3 ảnh cho mỗi sản phẩm' });
      }

      const uploaded = [];
      for (const file of files) {
        let result;
        if (hasCloudinaryConfig()) {
          result = await uploadBufferToCloudinary(file.buffer);
        } else {
          result = await uploadBufferToLocal(file, req);
        }
        uploaded.push({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
      return res.json({ images: uploaded, image_urls: uploaded.map((x) => x.url) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: err.message || 'Không thể upload ảnh' });
    }
  }
);

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
      image_urls,
      status,
    } = req.body || {};
    const role = String(req.user?.role || '').toLowerCase();
    const requesterStoreId = req.user?.storeId ? String(req.user.storeId) : null;

    const nameTrim = trimText(name);
    const skuTrim = trimText(sku);
    const barcodeTrim = trimText(barcode);
    const base = base_unit ? trimText(base_unit) : 'Cái';
    const costNum = parseNonNegativeNumber(cost_price);
    const stockNum = parseNonNegativeNumber(stock_qty);
    const reorderNum = parseNonNegativeNumber(reorder_level);

    if (!nameTrim) return res.status(400).json({ message: 'Tên sản phẩm không được để trống.' });
    if (!isValidProductName(nameTrim)) {
      return res.status(400).json({ message: 'Tên sản phẩm không được chứa ký tự đặc biệt.' });
    }
    if (!skuTrim) return res.status(400).json({ message: 'SKU không được để trống.' });
    if (!SKU_REGEX.test(skuTrim)) {
      return res.status(400).json({ message: 'SKU chỉ được gồm chữ và số.' });
    }
    if (barcodeTrim && !DIGITS_ONLY_REGEX.test(barcodeTrim)) {
      return res.status(400).json({ message: 'Barcode chỉ được nhập số, không chữ hoặc ký tự đặc biệt.' });
    }
    if (!isValidNoSpecialText(base)) {
      return res.status(400).json({ message: 'Đơn vị tồn kho không được chứa ký tự đặc biệt.' });
    }
    if (costNum == null) return res.status(400).json({ message: 'Giá vốn không hợp lệ.' });
    if (stockNum == null) return res.status(400).json({ message: 'Tồn kho không hợp lệ.' });
    if (reorderNum == null) return res.status(400).json({ message: 'Mức tồn tối thiểu không hợp lệ.' });

    let selling_units = Array.isArray(bodyUnits) && bodyUnits.length > 0
      ? bodyUnits.map((u) => {
        const unitName = trimText(u.name) || base;
        const ratioNum = parseNonNegativeNumber(u.ratio);
        const saleNum = parseNonNegativeNumber(u.sale_price);
        const unitBarcode = trimText(u.barcode) || undefined;
        const parsedRatio = ratioNum != null && ratioNum > 0 ? ratioNum : 1;
        return {
          name: unitName,
          ratio: Math.abs(parsedRatio - 1) < 1e-9 || unitName === base ? 1 : parsedRatio,
          sale_price: saleNum != null ? Math.round(saleNum) : 0,
          barcode: unitBarcode,
        };
      })
      : [{ name: base, ratio: 1, sale_price: Math.round(parseNonNegativeNumber(sale_price) ?? 0), barcode: barcodeTrim || undefined }];

    for (const u of selling_units) {
      if (!isValidNoSpecialText(u.name)) {
        return res.status(400).json({ message: 'Tên đơn vị bán không được chứa ký tự đặc biệt.' });
      }
      if (!Number.isFinite(Number(u.ratio)) || Number(u.ratio) <= 0) {
        return res.status(400).json({ message: 'Tỉ lệ đơn vị bán phải lớn hơn 0.' });
      }
      if (!Number.isFinite(Number(u.sale_price)) || Number(u.sale_price) < 0) {
        return res.status(400).json({ message: 'Giá bán đơn vị không hợp lệ.' });
      }
      if (u.barcode && !DIGITS_ONLY_REGEX.test(u.barcode)) {
        return res.status(400).json({ message: `Barcode đơn vị "${u.name}" chỉ được nhập số.` });
      }
    }
    const seenUnitNames = new Set();
    for (const u of selling_units) {
      const k = String(u.name || '').trim().toLowerCase();
      if (!k) continue;
      if (seenUnitNames.has(k)) {
        return res.status(400).json({ message: `Tên đơn vị bán bị trùng: "${u.name}"` });
      }
      seenUnitNames.add(k);
    }
    const ratioOneCount = selling_units.filter((u) => Number(u.ratio) === 1).length;
    if (ratioOneCount > 1) {
      return res.status(400).json({
        message:
          'Chỉ được có 1 đơn vị có tỉ lệ = 1 (đơn vị gốc). Các đơn vị như thùng/lốc phải có tỉ lệ > 1.',
      });
    }

    const hasBase = selling_units.some((u) => u.ratio === 1 || String(u.name || '').trim() === base);
    if (!hasBase) {
      selling_units = [{
        name: base,
        ratio: 1,
        sale_price: selling_units[0] ? selling_units[0].sale_price : 0,
        barcode: barcodeTrim || undefined,
      }, ...selling_units];
    }
    const seenUnitBarcodes = new Set();
    for (const u of selling_units) {
      const b = String(u.barcode || '').trim();
      if (!b) continue;
      if (seenUnitBarcodes.has(b)) {
        return res.status(400).json({ message: `Barcode "${b}" bị trùng giữa các đơn vị của cùng sản phẩm.` });
      }
      seenUnitBarcodes.add(b);
    }

    const baseUnit = selling_units.find((u) => String(u.name || '').trim() === base) || selling_units.find((u) => u.ratio === 1);
    const baseUnitPrice = Math.round(baseUnit ? baseUnit.sale_price : (Number(sale_price) || 0));
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

    await cleanupOrphanProductUnitsByBarcodes({
      barcodes: [barcodeTrim, ...selling_units.map((u) => u.barcode)],
      storeId: resolvedStoreId,
    });

    const duplicate = await findSkuDuplicate({ sku, storeId: resolvedStoreId });
    if (duplicate) {
      return res.status(409).json({
        message: 'SKU đã tồn tại trong cửa hàng này',
        existing_product_id: duplicate._id,
        code: 'SKU_ALREADY_EXISTS',
      });
    }

    const expCheck = validateExpiryDateForWrite(expiry_date);
    if (!expCheck.ok) {
      return res.status(400).json({ message: expCheck.message });
    }

    if (barcodeTrim) {
      const dupBc = await findBarcodeDuplicate({ barcode: barcodeTrim, storeId: resolvedStoreId });
      if (dupBc) {
        return res.status(409).json({
          message: 'Barcode đã tồn tại cho sản phẩm khác trong cửa hàng này',
          existing_product_id: dupBc.product_id || dupBc._id,
          code: 'BARCODE_ALREADY_EXISTS',
        });
      }
    }
    for (const u of selling_units) {
      const ub = String(u.barcode || '').trim();
      if (!ub) continue;
      const dupUnitBarcode = await findBarcodeDuplicate({ barcode: ub, storeId: resolvedStoreId });
      if (dupUnitBarcode) {
        return res.status(409).json({
          message: `Barcode đơn vị "${ub}" đã tồn tại trong cửa hàng. Vui lòng kiểm tra barcode từng đơn vị.`,
          existing_product_id: dupUnitBarcode.product_id || dupUnitBarcode._id,
          code: 'DUPLICATE_PRODUCT_UNIT_BARCODE',
        });
      }
    }

    const safeImageUrls = normalizeImageUrls(image_urls);
    if (Array.isArray(image_urls) && image_urls.length > 3) {
      return res.status(400).json({ message: 'Chỉ được lưu tối đa 3 ảnh cho mỗi sản phẩm' });
    }

    const resolvedSupplierId = supplier_id && mongoose.isValidObjectId(supplier_id) ? supplier_id : undefined;

    // Tạo sản phẩm với stock_qty = 0; tồn kho sẽ được cộng qua GoodsReceipt bên dưới
    // Với trường hợp có tồn kho ban đầu, chạy transaction all-or-nothing để tránh tạo dở dang.
    if (stockNum > 0 && resolvedSupplierId) {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        const [doc] = await Product.create([{
          category_id: category_id && mongoose.isValidObjectId(category_id) ? category_id : undefined,
          supplier_id: resolvedSupplierId,
          storeId: resolvedStoreId,
          name: nameTrim,
          sku: skuTrim,
          barcode: barcodeTrim || undefined,
          cost_price: Math.round(costNum),
          sale_price: Math.round(baseUnitPrice),
          stock_qty: 0,
          reorder_level: reorderNum,
          expiry_date: expCheck.date,
          base_unit: base,
          selling_units,
          image_urls: safeImageUrls,
          status: status === 'inactive' ? 'inactive' : 'active',
        }], { session });
        await syncProductUnitsFromProduct(doc, session);

      const paymentType = ['cash', 'credit'].includes(req.body.payment_type) ? req.body.payment_type : 'credit';
      const unitCost = Math.round(costNum);
      const totalCost = unitCost * stockNum;
      let payableDueDate = null;
      if (paymentType === 'credit') {
        const supplierDoc = await Supplier.findOne({ _id: resolvedSupplierId, storeId: resolvedStoreId }).session(session);
        const termDays = Number(supplierDoc?.default_payment_term_days) || 0;
        const effectiveTermDays = termDays > 0 ? termDays : 30;
        payableDueDate = new Date();
        payableDueDate.setDate(payableDueDate.getDate() + effectiveTermDays);
      }

        const [gr] = await GoodsReceipt.create([{
          supplier_id: resolvedSupplierId,
          storeId: resolvedStoreId,
          received_by: req.user.id,
          approved_by: req.user.id,
          status: 'approved',
          received_at: new Date(),
          items: [{
            product_id: doc._id,
            product_name_snapshot: String(doc.name || '').trim() || undefined,
            product_sku_snapshot: String(doc.sku || '').trim() || undefined,
            quantity: stockNum,
            unit_cost: unitCost,
            system_unit_cost: unitCost,
            unit_name: base,
            ratio: 1,
          }],
          total_amount: totalCost,
          payment_type: paymentType,
          amount_paid_at_approval: paymentType === 'cash' ? totalCost : 0,
          reason: 'Nhập kho ban đầu khi tạo sản phẩm',
        }], { session });

        await adjustStockFIFO(doc._id, resolvedStoreId, stockNum, {
          session,
          unitCost,
          receivedAt: new Date(),
          receiptId: gr._id,
          note: 'Nhập kho ban đầu khi tạo sản phẩm',
          newCostPrice: unitCost,
          movementType: 'IN_GR',
          referenceType: 'goods_receipt',
          referenceId: gr._id,
          actorId: req.user.id,
        });

        // Tạo SupplierPayable chỉ khi có NCC được chọn
        if (resolvedSupplierId) {
          const paid = paymentType === 'cash' ? totalCost : 0;
          const [payable] = await SupplierPayable.create([{
            supplier_id: resolvedSupplierId,
            storeId: resolvedStoreId,
            source_type: 'goods_receipt',
            source_id: gr._id,
            total_amount: totalCost,
            paid_amount: paid,
            remaining_amount: totalCost - paid,
            status: paymentType === 'cash' ? 'paid' : 'open',
            due_date: payableDueDate || undefined,
            created_by: req.user.id,
          }], { session });
          if (paid > 0) {
            const paymentMethod = ['cash', 'bank_transfer', 'e_wallet', 'other'].includes(req.body.payment_method)
              ? req.body.payment_method
              : 'cash';
            const [paymentDoc] = await SupplierPayment.create([{
              supplier_id: resolvedSupplierId,
              storeId: resolvedStoreId,
              total_amount: paid,
              payment_date: new Date(),
              payment_method: paymentMethod,
              note: `Thanh toán khi tạo sản phẩm mới #${String(doc._id).slice(-6).toUpperCase()}`,
              created_by: req.user.id,
            }], { session });
            await SupplierPaymentAllocation.create([{
              payment_id: paymentDoc._id,
              payable_id: payable._id,
              amount: paid,
            }], { session });
          }
        }

        await session.commitTransaction();
        const updatedDoc = await Product.findById(doc._id).lean();
        return res.status(201).json({ product: normalizeProduct(updatedDoc) });
      } catch (txnErr) {
        if (session.inTransaction()) await session.abortTransaction();
        throw txnErr;
      } finally {
        session.endSession();
      }
    }

    const doc = await Product.create({
      category_id: category_id && mongoose.isValidObjectId(category_id) ? category_id : undefined,
      supplier_id: resolvedSupplierId,
      storeId: resolvedStoreId,
      name: nameTrim,
      sku: skuTrim,
      barcode: barcodeTrim || undefined,
      cost_price: Math.round(costNum),
      sale_price: Math.round(baseUnitPrice),
      stock_qty: 0,
      reorder_level: reorderNum,
      expiry_date: expCheck.date,
      base_unit: base,
      selling_units,
      image_urls: safeImageUrls,
      status: status === 'inactive' ? 'inactive' : 'active',
    });
    await syncProductUnitsFromProduct(doc);

    return res.status(201).json({ product: normalizeProduct(doc.toObject()) });
  } catch (err) {
    if (err?.code === 11000) {
      const keys = err.keyPattern || {};
      const dupKeyText = String(err?.message || '');
      if (!Object.keys(keys).length && /product_id_1_unit_name_1/.test(dupKeyText)) {
        return res.status(409).json({
          message: 'Tên đơn vị bán bị trùng trên cùng sản phẩm. Vui lòng kiểm tra lại danh sách đơn vị.',
          code: 'DUPLICATE_PRODUCT_UNIT_NAME',
        });
      }
      if (!Object.keys(keys).length && /storeId_1_barcode_1/.test(dupKeyText)) {
        return res.status(409).json({
          message: 'Barcode đơn vị bị trùng trong cửa hàng. Vui lòng kiểm tra barcode từng đơn vị.',
          code: 'DUPLICATE_PRODUCT_UNIT_BARCODE',
        });
      }
      if (keys.product_id && keys.unit_name) {
        return res.status(409).json({
          message: 'Danh sách đơn vị bán có tên bị trùng trên cùng sản phẩm. Vui lòng kiểm tra lại mục "Đơn vị bán & barcode".',
          duplicate_keys: keys,
        });
      }
      if (keys.barcode) {
        return res.status(409).json({ message: 'Barcode đã tồn tại cho sản phẩm khác trong cửa hàng này' });
      }
      if (keys.storeId && keys.sku) {
        return res.status(409).json({ message: 'SKU đã tồn tại trong cửa hàng này', duplicate_keys: keys });
      }
      const indexMatch = dupKeyText.match(/index:\s*([^\s]+)\s*dup key/i);
      return res.status(409).json({
        message: 'Dữ liệu bị trùng trong hệ thống. Vui lòng kiểm tra lại thông tin.',
        code: 'DUPLICATE_DATA',
        duplicate_keys: keys,
        duplicate_index: indexMatch ? indexMatch[1] : undefined,
      });
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
      const matchedUnitRows = await ProductUnit.find({ ...filter, barcode: re }).select('product_id').lean();
      const matchedProductIds = matchedUnitRows.map((u) => u.product_id);
      filter.$or = [{ name: re }, { sku: re }, { barcode: re }, { _id: { $in: matchedProductIds } }];
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

// GET /api/products/scan/:code  (staff, manager, admin)
router.get('/scan/:code', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ message: 'Mã quét không hợp lệ' });
    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({
        message: 'Tài khoản chưa được gán cửa hàng.',
        code: 'STORE_REQUIRED',
      });
    }

    const productFilter = { ...storeFilter };
    const unitFilter = { ...storeFilter };
    if (storeFilter.storeId == null) {
      productFilter.storeId = null;
      unitFilter.storeId = null;
    }

    // Ưu tiên barcode unit để phân biệt lốc/thùng.
    let matchedUnit = await ProductUnit.findOne({ ...unitFilter, barcode: code }).lean();
    let product = null;
    if (matchedUnit) {
      product = await Product.findOne({ _id: matchedUnit.product_id, ...productFilter }).lean();
    }

    // Fallback: barcode hoặc SKU của product => trả về base unit.
    if (!product) {
      product = await Product.findOne({
        ...productFilter,
        $or: [{ barcode: code }, { sku: code }],
      }).lean();
      if (product) {
        matchedUnit = await getBaseUnitOfProduct(product);
      }
    }

    if (!product || !matchedUnit) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm theo mã quét' });
    }

    return res.json({
      product: normalizeProduct(product),
      unit: matchedUnit,
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
    const { rows, confirmPriceChanges, mode = 'catalog' } = req.body || {};
    const isOpeningBalance = mode === 'opening_balance';
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

    // Kiểm tra thay đổi giá bán — nếu có mà chưa xác nhận thì chặn lại
    // Lưu ý: import Excel CHỈ cập nhật giá bán (sale_price) và thông tin catalog.
    // Giá vốn (cost_price) KHÔNG bị thay đổi qua import — phải đi qua phiếu nhập hàng (GoodsReceipt).
    // Số lượng tồn kho KHÔNG cộng thêm qua import — phải đi qua phiếu nhập hàng (GoodsReceipt).
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
        const oldSale = Number(existing.sale_price) || 0;
        const newSale = Number(raw.sale_price) || 0;
        if (oldSale !== newSale) {
          pendingChanges.push({
            name: existing.name,
            sku: existing.sku,
            old_sale_price: oldSale,
            new_sale_price: newSale,
          });
        }
      }
      if (pendingChanges.length > 0) {
        return res.status(409).json({
          code: 'PRICE_CHANGE_CONFIRMATION_REQUIRED',
          message: `Có ${pendingChanges.length} sản phẩm bị thay đổi giá bán. Vui lòng xác nhận trước khi import.`,
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
          const oldSale = Number(existing.sale_price) || 0;
          const oldCost = Number(existing.cost_price) || 0;

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

          if (isOpeningBalance) {
            // Chế độ Nhập đầu kỳ: SET tồn kho về đúng số trong file Excel, cập nhật cả giá vốn và giá bán
            const newQty = Math.round(stock_qty);
            const newCost = Math.round(cost_price);
            const currentQty = Number(existing.stock_qty) || 0;
            const delta = newQty - currentQty;

            // Xóa toàn bộ lô cũ còn hàng và tạo lại lô mới với số lượng đầu kỳ
            await StockBatch.deleteMany({ productId: existing._id, storeId: resolvedStoreId || existing.storeId });
            if (newQty > 0) {
              await StockBatch.create({
                productId: existing._id,
                storeId: resolvedStoreId || existing.storeId,
                initial_qty: newQty,
                remaining_qty: newQty,
                unit_cost: newCost,
                received_at: new Date(),
                note: 'Tồn kho đầu kỳ (Import Excel)',
              });
            }

            existing.stock_qty = newQty;
            existing.cost_price = newCost;
            existing.sale_price = Math.round(sale_price);
            existing.base_unit = base_unit || base;
            existing.selling_units = [{ name: base_unit || base, ratio: 1, sale_price: Math.round(sale_price) }];
            if (barcodeIn) existing.barcode = barcodeIn;
            existing.updated_at = new Date();
            await existing.save();

            await logPriceChange({
              productId: existing._id,
              storeId: existing.storeId || resolvedStoreId || null,
              changedBy: req.user?.id,
              source: 'opening_balance',
              sourceNote: 'Nhập đầu kỳ từ Excel',
              oldCost,
              newCost: existing.cost_price,
              oldSale,
              newSale: existing.sale_price,
            });
            updated.push({
              row: rowLabel,
              action: 'updated',
              note: `Đầu kỳ: đặt lại tồn kho = ${newQty}, giá vốn = ${newCost.toLocaleString('vi-VN')}₫.`,
              product: normalizeProduct(existing.toObject()),
            });
          } else {
            // Chế độ Cập nhật danh mục: chỉ cập nhật giá bán và thông tin catalog, KHÔNG đổi tồn kho hay giá vốn
            existing.sale_price = Math.round(sale_price);
            existing.base_unit = base_unit || base;
            existing.selling_units = [{ name: base_unit || base, ratio: 1, sale_price: Math.round(sale_price) }];
            if (barcodeIn) existing.barcode = barcodeIn;
            existing.updated_at = new Date();
            await existing.save();
            await logPriceChange({
              productId: existing._id,
              storeId: existing.storeId || resolvedStoreId || null,
              changedBy: req.user?.id,
              source: 'import_excel',
              oldCost,
              newCost: oldCost,
              oldSale,
              newSale: existing.sale_price,
            });
            updated.push({
              row: rowLabel,
              action: 'updated',
              note: 'Cập nhật giá bán và thông tin catalog. Tồn kho và giá vốn không thay đổi.',
              product: normalizeProduct(existing.toObject()),
            });
          }
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

        const selling_units = [{ name: base_unit || base, ratio: 1, sale_price: Math.round(sale_price) }];
        const newCostRounded = Math.round(cost_price);
        const doc = await Product.create({
          storeId: resolvedStoreId,
          name,
          sku,
          barcode: barcodeIn || undefined,
          cost_price: newCostRounded,
          sale_price: Math.round(sale_price),
          stock_qty,
          reorder_level: 0,
          base_unit: base_unit || base,
          selling_units,
          status: 'active',
        });

        // Với sản phẩm mới: luôn tạo StockBatch để FIFO tracking hoạt động đúng
        if (stock_qty > 0) {
          const batchNote = isOpeningBalance ? 'Tồn kho đầu kỳ (Import Excel)' : 'Nhập kho ban đầu qua Import Excel';
          await StockBatch.create({
            productId: doc._id,
            storeId: resolvedStoreId,
            initial_qty: stock_qty,
            remaining_qty: stock_qty,
            unit_cost: newCostRounded,
            received_at: new Date(),
            note: batchNote,
          });
        }

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
router.get('/:id/units', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid product id' });
    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
    }
    const product = await Product.findOne({ _id: id, ...storeFilter });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    let units = await ProductUnit.find({ product_id: id }).sort({ is_base: -1, exchange_value: 1 }).lean();
    // Backward compatibility: sản phẩm cũ có selling_units nhưng chưa có ProductUnit.
    if (!units || units.length === 0) {
      try {
        await syncProductUnitsFromProduct(product);
      } catch (syncErr) {
        // Fallback an toàn: nếu sync lỗi do dữ liệu cũ/xung đột barcode,
        // vẫn đảm bảo có tối thiểu 1 đơn vị base để vận hành nhập/bán không bị chặn.
        await ProductUnit.findOneAndUpdate(
          { product_id: product._id, unit_name: String(product.base_unit || 'Cái').trim() || 'Cái' },
          {
            $set: {
              storeId: product.storeId || null,
              unit_name: String(product.base_unit || 'Cái').trim() || 'Cái',
              exchange_value: 1,
              price: Math.round(Number(product.sale_price) || 0),
              barcode: undefined,
              is_base: true,
              updated_at: new Date(),
            },
            $setOnInsert: { created_at: new Date() },
          },
          { upsert: true, new: true }
        );
      }
      units = await ProductUnit.find({ product_id: id }).sort({ is_base: -1, exchange_value: 1 }).lean();
    }
    return res.json({ units: units || [] });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id/units', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const payload = Array.isArray(req.body?.units) ? req.body.units : [];
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid product id' });
    if (payload.length === 0) return res.status(400).json({ message: 'units is required' });

    const storeFilter = getRoleStoreFilter(req);
    if (storeFilter == null) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
    }
    const product = await Product.findOne({ _id: id, ...storeFilter });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const normalized = payload.map((u) => normalizeUnitInput(u, product.base_unit || 'Cái'));
    const baseCount = normalized.filter((u) => u.is_base).length;
    if (baseCount !== 1) {
      return res.status(400).json({ message: 'Phải có đúng 1 đơn vị gốc (is_base=true)' });
    }

    const seenNames = new Set();
    const seenBarcodes = new Set();
    for (const u of normalized) {
      if (!u.unit_name) return res.status(400).json({ message: 'unit_name is required' });
      const key = u.unit_name.toLowerCase();
      if (seenNames.has(key)) return res.status(400).json({ message: 'Tên đơn vị bị trùng trên cùng sản phẩm' });
      seenNames.add(key);
      const barcode = trimText(u.barcode);
      if (barcode) {
        if (!DIGITS_ONLY_REGEX.test(barcode)) {
          return res.status(400).json({ message: 'Barcode đơn vị chỉ được nhập số, không chữ hoặc ký tự đặc biệt.' });
        }
        if (seenBarcodes.has(barcode)) {
          return res.status(400).json({ message: 'Barcode đơn vị bị trùng trong cùng sản phẩm' });
        }
        seenBarcodes.add(barcode);
      }
    }

    for (const u of normalized) {
      const barcode = trimText(u.barcode);
      if (!barcode) continue;
      const dup = await findBarcodeDuplicate({
        barcode,
        storeId: product.storeId,
        excludeId: product._id,
      });
      if (dup) {
        return res.status(409).json({
          message: `Barcode "${barcode}" đã tồn tại cho sản phẩm/đơn vị khác trong cửa hàng này`,
        });
      }
    }

    await ProductUnit.deleteMany({ product_id: product._id });
    const docs = normalized.map((u) => ({
      product_id: product._id,
      storeId: product.storeId || null,
      unit_name: u.unit_name,
      exchange_value: u.exchange_value,
      price: u.price,
      barcode: u.barcode,
      is_base: u.is_base,
      created_at: new Date(),
      updated_at: new Date(),
    }));
    const units = await ProductUnit.insertMany(docs, { ordered: true });
    const base = units.find((u) => u.is_base);
    if (base) {
      product.base_unit = base.unit_name;
      product.sale_price = base.price;
      product.barcode = base.barcode;
    }
    product.selling_units = units.map((u) => ({
      name: u.unit_name,
      ratio: u.exchange_value,
      sale_price: u.price,
    }));
    product.updated_at = new Date();
    await product.save();

    return res.json({ units });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Barcode đơn vị đã tồn tại trong cửa hàng này' });
    }
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

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
    const units = await ProductUnit.find({ product_id: product._id })
      .sort({ exchange_value: 1, unit_name: 1 })
      .lean();
    return res.json({ product: { ...normalizeProduct(product), units } });
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
      image_urls,
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

    if (name !== undefined) {
      const nameTrim = trimText(name);
      if (!nameTrim) return res.status(400).json({ message: 'Tên sản phẩm không được để trống.' });
      if (!isValidProductName(nameTrim)) {
        return res.status(400).json({ message: 'Tên sản phẩm không được chứa ký tự đặc biệt.' });
      }
      product.name = nameTrim;
    }
    if (sku !== undefined) {
      const skuTrim = trimText(sku);
      if (!skuTrim) return res.status(400).json({ message: 'SKU không được để trống.' });
      if (!SKU_REGEX.test(skuTrim)) {
        return res.status(400).json({ message: 'SKU chỉ được gồm chữ và số.' });
      }
      product.sku = skuTrim;
    }

    if (barcode !== undefined) {
      const bc = trimText(barcode);
      if (bc && !DIGITS_ONLY_REGEX.test(bc)) {
        return res.status(400).json({ message: 'Barcode chỉ được nhập số, không chữ hoặc ký tự đặc biệt.' });
      }
      if (bc) {
        const dupB = await findBarcodeDuplicate({ barcode: bc, storeId: product.storeId, excludeId: id });
        if (dupB) {
          return res.status(409).json({ message: 'Barcode đã tồn tại cho sản phẩm khác trong cửa hàng này' });
        }
      }
      product.barcode = bc || undefined;
    }

    if (cost_price !== undefined) {
      const n = parseNonNegativeNumber(cost_price);
      if (n == null) return res.status(400).json({ message: 'Giá vốn không hợp lệ.' });
      product.cost_price = Math.round(n);
    }
    if (stock_qty !== undefined) {
      const n = parseNonNegativeNumber(stock_qty);
      if (n == null) return res.status(400).json({ message: 'Tồn kho không hợp lệ.' });
      product.stock_qty = n;
    }
    if (reorder_level !== undefined) {
      const n = parseNonNegativeNumber(reorder_level);
      if (n == null) return res.status(400).json({ message: 'Mức tồn tối thiểu không hợp lệ.' });
      product.reorder_level = n;
    }
    if (base_unit !== undefined) {
      const base = base_unit ? trimText(base_unit) : 'Cái';
      if (!isValidNoSpecialText(base)) {
        return res.status(400).json({ message: 'Đơn vị tồn kho không được chứa ký tự đặc biệt.' });
      }
      product.base_unit = base;
    }
    if (status !== undefined) product.status = status === 'inactive' ? 'inactive' : 'active';
    if (category_id !== undefined) {
      product.category_id = category_id && mongoose.isValidObjectId(category_id) ? category_id : null;
    }
    if (supplier_id !== undefined) {
      product.supplier_id = supplier_id && mongoose.isValidObjectId(supplier_id) ? supplier_id : null;
    }
    if (image_urls !== undefined) {
      if (Array.isArray(image_urls) && image_urls.length > 3) {
        return res.status(400).json({ message: 'Chỉ được lưu tối đa 3 ảnh cho mỗi sản phẩm' });
      }
      product.image_urls = normalizeImageUrls(image_urls);
    }
    if (sku !== undefined) {
      const duplicate = await findSkuDuplicate({ sku, storeId: product.storeId, excludeId: id });
      if (duplicate) {
        return res.status(409).json({ message: 'SKU đã tồn tại trong cửa hàng này' });
      }
    }

    if (Array.isArray(bodyUnits) && bodyUnits.length > 0) {
      const base = product.base_unit || 'Cái';
      const units = bodyUnits.map((u) => {
        const unitName = trimText(u.name) || base;
        const ratioNum = parseNonNegativeNumber(u.ratio);
        const saleNum = parseNonNegativeNumber(u.sale_price);
        const parsedRatio = ratioNum != null && ratioNum > 0 ? ratioNum : 1;
        return {
          name: unitName,
          ratio: Math.abs(parsedRatio - 1) < 1e-9 || unitName === base ? 1 : parsedRatio,
          sale_price: saleNum != null ? Math.round(saleNum) : 0,
        };
      });
      for (const u of units) {
        if (!isValidNoSpecialText(u.name)) {
          return res.status(400).json({ message: 'Tên đơn vị bán không được chứa ký tự đặc biệt.' });
        }
        if (!Number.isFinite(Number(u.ratio)) || Number(u.ratio) <= 0) {
          return res.status(400).json({ message: 'Tỉ lệ đơn vị bán phải lớn hơn 0.' });
        }
        if (!Number.isFinite(Number(u.sale_price)) || Number(u.sale_price) < 0) {
          return res.status(400).json({ message: 'Giá bán đơn vị không hợp lệ.' });
        }
      }
      const baseByName = units.find((u) => String(u.name || '').trim() === base);
      const baseByRatio = units.find((u) => u.ratio === 1);
      const hasBase = Boolean(baseByName || baseByRatio);
      const fallbackBaseSale = baseByName?.sale_price ?? baseByRatio?.sale_price ?? Math.round(Number(product.sale_price) || 0);
      product.selling_units = hasBase ? units : [{ name: base, ratio: 1, sale_price: fallbackBaseSale }, ...units];
      const baseUnitPrice =
        product.selling_units.find((u) => String(u.name || '').trim() === base)?.sale_price
        ?? product.selling_units.find((u) => u.ratio === 1)?.sale_price
        ?? fallbackBaseSale;
      product.sale_price = Math.round(baseUnitPrice);
    } else if (sale_price !== undefined) {
      const saleNum = parseNonNegativeNumber(sale_price);
      if (saleNum == null) return res.status(400).json({ message: 'Giá bán không hợp lệ.' });
      product.sale_price = Math.round(saleNum);
      product.selling_units = [{ name: product.base_unit || 'Cái', ratio: 1, sale_price: product.sale_price }];
    }
    product.updated_at = new Date();
    await product.save();
    await syncProductUnitsFromProduct(product);
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

// GET /api/products/:id/batches — Lấy danh sách lô hàng (FIFO) của sản phẩm
router.get('/:id/batches', requireAuth, requireRole(['manager', 'admin', 'staff']), async (req, res) => {
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

    let batches = await StockBatch.find({ productId: id, ...storeFilter, remaining_qty: { $gt: 0 } })
      .sort({ received_at: 1 }) // FIFO: lô cũ nhất lên trước
      .lean();

    // Self-healing: Nếu sản phẩm có tồn kho thực tế nhưng chưa có lô hàng nào trong DB
    // (do dữ liệu cũ hoặc lỗi đồng bộ), tạo một lô "Legacy" để hệ thống FIFO tiếp tục chạy đúng.
    if (batches.length === 0) {
      const product = await Product.findOne({ _id: id, ...storeFilter }).lean();
      if (product && product.stock_qty > 0) {
        const legacyBatch = await StockBatch.create({
          productId: id,
          storeId: storeFilter.storeId,
          initial_qty: product.stock_qty,
          remaining_qty: product.stock_qty,
          unit_cost: product.cost_price || 0,
          received_at: product.created_at || new Date(),
          note: 'Hàng tồn kho ban đầu (Legacy)',
        });
        batches = [legacyBatch.toObject()];
      }
    }

    return res.json({ batches });
  } catch (err) {
    console.error('Get batches error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
