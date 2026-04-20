const TEXT_NO_SPECIAL_REGEX = /^[\p{L}\p{N}\s]+$/u;

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseOptionalDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function trimText(value) {
  return String(value || '').trim();
}

function isValidNoSpecialText(value) {
  return TEXT_NO_SPECIAL_REGEX.test(trimText(value));
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

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

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

function normalizeProduct(p) {
  if (!p) return p;
  const base = p.base_unit || 'Cái';
  const imageUrls = normalizeImageUrls(p.image_urls);
  const units = p.selling_units && p.selling_units.length > 0
    ? p.selling_units
    : [{ name: base, ratio: 1, sale_price: p.sale_price != null ? p.sale_price : 0 }];
  const baseUnit = units.find((u) => u.ratio === 1) || units[0];
  const hasNamedBase = units.some((u) => String(u.name || '').trim() === base);
  const finalUnits = hasNamedBase ? units : [{ name: base, ratio: 1, sale_price: baseUnit?.sale_price || 0 }, ...units];
  return {
    ...p,
    base_unit: base,
    image_urls: imageUrls,
    selling_units: finalUnits,
    sale_price: baseUnit ? baseUnit.sale_price : (p.sale_price || 0),
  };
}

function getRoleStoreFilter(req) {
  const role = String(req?.user?.role || '').toLowerCase();
  if (!role) return null;
  if (role === 'admin') return {};
  const isStoreScopedRole = ['manager', 'staff'].includes(role);
  if (!isStoreScopedRole) return {};
  const storeId = req?.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId) return null;
  return { storeId };
}

module.exports = {
  escapeRegex,
  parseOptionalDate,
  trimText,
  isValidNoSpecialText,
  parseNonNegativeNumber,
  normalizeImageUrls,
  extensionFromMimetype,
  startOfDay,
  validateExpiryDateForWrite,
  normalizeProduct,
  getRoleStoreFilter,
};
