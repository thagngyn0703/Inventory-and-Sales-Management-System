const XLSX = require('xlsx');
const crypto = require('crypto');

const MAX_ROWS = 2000;
const MAX_NAME_LEN = 200;

/** @type {Record<string, string[]>} */
const HEADER_ALIASES = {
  name: [
    'tên sản phẩm',
    'ten san pham',
    'name',
    'product name',
    'sản phẩm',
    'san pham',
    'product',
  ],
  cost_price: [
    'giá gốc',
    'gia goc',
    'cost_price',
    'cost',
    'giá vốn',
    'gia von',
    'giá nhập',
    'gia nhap',
  ],
  sale_price: [
    'giá bán',
    'gia ban',
    'sale_price',
    'price',
    'giá',
    'gia',
    'giá bán lẻ',
  ],
  sku: ['sku', 'mã', 'ma', 'mã hàng', 'ma hang', 'product code', 'code'],
  stock_qty: ['tồn kho', 'ton kho', 'stock', 'stock_qty', 'số lượng', 'so luong'],
  base_unit: ['đơn vị', 'don vi', 'unit', 'base_unit', 'dv'],
  barcode: ['barcode', 'mã vạch', 'ma vach', 'mã vạch sản phẩm'],
};

function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * @param {string[]} headers
 * @param {string[]} aliases
 */
function findColumnIndex(headers, aliases) {
  const normHeaders = headers.map((h) => normalizeHeader(h));
  for (const alias of aliases) {
    const a = normalizeHeader(alias);
    const idx = normHeaders.findIndex((h) => h === a);
    if (idx >= 0) return idx;
  }
  for (const alias of aliases) {
    const a = normalizeHeader(alias);
    const idx = normHeaders.findIndex((h) => h.includes(a) || a.includes(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * @param {unknown} v
 */
function parseNumber(v) {
  if (v === '' || v === null || v === undefined) return NaN;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  let s = String(v).trim().replace(/\s/g, '');
  if (s === '') return NaN;
  // Keep only numeric separators and sign, ignore currency symbols/text.
  s = s.replace(/[^0-9,.\-]/g, '');
  if (!s) return NaN;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  // e.g. 1.234.567,89
  const vnThousandsPattern = /^\-?\d{1,3}(\.\d{3})+(,\d+)?$/;
  // e.g. 1,234,567.89
  const usThousandsPattern = /^\-?\d{1,3}(,\d{3})+(\.\d+)?$/;

  if (hasComma && hasDot) {
    if (vnThousandsPattern.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (usThousandsPattern.test(s)) {
      s = s.replace(/,/g, '');
    } else {
      // Fallback: treat the last separator as decimal mark.
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      const decimalSep = lastComma > lastDot ? ',' : '.';
      if (decimalSep === ',') {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    }
  } else if (hasComma) {
    // e.g. 1,234,567
    if (/^\-?\d{1,3}(,\d{3})+$/.test(s)) {
      s = s.replace(/,/g, '');
    } else {
      // e.g. 12,5
      s = s.replace(',', '.');
    }
  } else if (hasDot) {
    // e.g. 1.234.567
    if (/^\-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {Buffer} buffer
 */
function parseExcelToMatrix(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { error: 'File Excel không có sheet nào.' };
  }
  const sheet = workbook.Sheets[sheetName];
  /** @type {unknown[][]} */
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  return { rows, sheetName };
}

/**
 * @param {unknown[][]} matrix
 */
function mapRowsFromMatrix(matrix) {
  if (!matrix || matrix.length < 2) {
    return { error: 'File cần có ít nhất một dòng tiêu đề và một dòng dữ liệu.' };
  }
  /** @type {string[]} */
  const headerRow = matrix[0].map((c) => String(c ?? '').trim());
  const idxName = findColumnIndex(headerRow, HEADER_ALIASES.name);
  const idxCost = findColumnIndex(headerRow, HEADER_ALIASES.cost_price);
  const idxSale = findColumnIndex(headerRow, HEADER_ALIASES.sale_price);
  const idxSku = findColumnIndex(headerRow, HEADER_ALIASES.sku);
  const idxStock = findColumnIndex(headerRow, HEADER_ALIASES.stock_qty);
  const idxUnit = findColumnIndex(headerRow, HEADER_ALIASES.base_unit);
  const idxBarcode = findColumnIndex(headerRow, HEADER_ALIASES.barcode);

  if (idxName < 0) {
    return {
      error:
        'Không tìm thấy cột tên sản phẩm. Thêm cột "Tên sản phẩm" (hoặc Name) ở dòng đầu tiên.',
    };
  }
  if (idxCost < 0 || idxSale < 0) {
    return {
      error:
        'Cần có cột "Giá nhập" và "Giá bán" (hoặc cost_price / sale_price) ở dòng tiêu đề.',
    };
  }

  /** @type {Array<{ row: number, name: string, cost_price: number|null, sale_price: number, sku?: string, stock_qty: number, base_unit: string, barcode?: string, errors: string[] }>} */
  const out = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;
    const name = String(row[idxName] ?? '').trim();
    const costRaw = row[idxCost];
    const saleRaw = row[idxSale];
    const sku = idxSku >= 0 ? String(row[idxSku] ?? '').trim() : '';
    const stockRaw = idxStock >= 0 ? row[idxStock] : '';
    const unit = idxUnit >= 0 ? String(row[idxUnit] ?? '').trim() : '';
    const barcode = idxBarcode >= 0 ? String(row[idxBarcode] ?? '').trim() : '';

    const errors = [];
    if (!name) errors.push('Thiếu tên sản phẩm');
    if (name.length > MAX_NAME_LEN) errors.push(`Tên quá dài (tối đa ${MAX_NAME_LEN} ký tự)`);

    const hasCostInput = String(costRaw ?? '').trim() !== '';
    const cost_price = parseNumber(costRaw);
    const sale_price = parseNumber(saleRaw);
    if (hasCostInput && (Number.isNaN(cost_price) || cost_price < 0)) errors.push('Giá nhập không hợp lệ');
    if (Number.isNaN(sale_price) || sale_price < 0) errors.push('Giá bán không hợp lệ');

    let stock_qty = 0;
    if (idxStock >= 0 && String(stockRaw).trim() !== '') {
      const sq = parseNumber(stockRaw);
      if (Number.isNaN(sq) || sq < 0) {
        errors.push('Tồn kho phải là số ≥ 0');
      } else {
        stock_qty = Math.round(sq);
      }
    }

    const base_unit = unit || 'Cái';

    out.push({
      row: i + 1,
      name,
      cost_price: Number.isNaN(cost_price) ? null : cost_price,
      sale_price: Number.isNaN(sale_price) ? 0 : sale_price,
      sku: sku || undefined,
      stock_qty,
      base_unit,
      barcode: barcode || undefined,
      errors,
    });
    if (out.length > MAX_ROWS) {
      return { error: `Tối đa ${MAX_ROWS} dòng sản phẩm mỗi lần import.` };
    }
  }

  if (out.length === 0) {
    return { error: 'Không có dòng dữ liệu hợp lệ sau dòng tiêu đề.' };
  }

  return {
    mapped: out,
    columnIndexes: { idxName, idxCost, idxSale, idxSku, idxStock, idxUnit, idxBarcode },
  };
}

function generateAutoSku(storeId, rowNum) {
  const sid = storeId ? String(storeId).replace(/[^a-fA-F0-9]/g, '').slice(-4) : '0000';
  const rnd = crypto.randomBytes(3).toString('hex');
  return `IMP-${sid}-${Date.now().toString(36)}-${rowNum}-${rnd}`;
}

/**
 * Build minimal .xlsx template buffer
 */
function buildTemplateBuffer() {
  const wsData = [
    [
      'Tên sản phẩm',
      'Giá nhập',
      'Giá bán',
      'SKU (tùy chọn)',
      'Số lượng cộng thêm (tùy chọn)',
      'Đơn vị cơ bản (tùy chọn)',
      'Barcode (tùy chọn)',
    ],
    ['Ví dụ mới: Sữa tươi 1L', 15000, 18000, '', 20, 'Lon', ''],
    ['Ví dụ đã có SKU: C2 Trà chanh', '', 12000, 'C2-CHANH-455', 24, 'Lon', ''],
    ['Ghi chú', 'Nếu để trống với hàng đã có thì dùng giá vốn hiện tại', 'Hàng đã có: không cập nhật giá bán', 'Ưu tiên match theo Barcode rồi đến SKU', 'Đây là số lượng cộng thêm', 'Số lượng phải theo đơn vị cơ bản', ''],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Sản phẩm');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  parseExcelToMatrix,
  mapRowsFromMatrix,
  generateAutoSku,
  buildTemplateBuffer,
  MAX_ROWS,
  HEADER_ALIASES,
};
