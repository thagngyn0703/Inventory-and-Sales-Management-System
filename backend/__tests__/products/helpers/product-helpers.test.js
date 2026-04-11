const {
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
} = require('../../../utils/product-helpers');

// ==================== escapeRegex ====================

describe('escapeRegex', () => {
  describe('Normal cases', () => {
    it('should return same string when no special chars', () => {
      expect(escapeRegex('hello')).toBe('hello');
    });

    it('should escape dot', () => {
      expect(escapeRegex('hello.world')).toBe('hello\\.world');
    });

    it('should escape all special chars', () => {
      const result = escapeRegex('.*+?^${}()|[]\\');
      expect(result).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });
  });

  describe('Abnormal cases', () => {
    it('should handle empty string', () => {
      expect(escapeRegex('')).toBe('');
    });

    it('should convert null to string "null"', () => {
      expect(escapeRegex(null)).toBe('null');
    });

    it('should convert undefined to string "undefined"', () => {
      expect(escapeRegex(undefined)).toBe('undefined');
    });

    it('should convert number to string', () => {
      expect(escapeRegex(123)).toBe('123');
    });
  });
});

// ==================== parseOptionalDate ====================

describe('parseOptionalDate', () => {
  describe('Normal cases', () => {
    it('should parse valid date string', () => {
      const result = parseOptionalDate('2024-12-31');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString().startsWith('2024-12-31')).toBe(true);
    });

    it('should return Date object as-is', () => {
      const input = new Date('2024-12-31');
      const result = parseOptionalDate(input);
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('Abnormal cases', () => {
    it('should return undefined for empty string', () => {
      expect(parseOptionalDate('')).toBe(undefined);
    });

    it('should return undefined for null', () => {
      expect(parseOptionalDate(null)).toBe(undefined);
    });

    it('should return undefined for undefined', () => {
      expect(parseOptionalDate(undefined)).toBe(undefined);
    });

    it('should return undefined for invalid date string', () => {
      expect(parseOptionalDate('invalid-date')).toBe(undefined);
    });

    it('should return undefined for whitespace only', () => {
      expect(parseOptionalDate('   ')).toBe(undefined);
    });
  });
});

// ==================== trimText ====================

describe('trimText', () => {
  describe('Normal cases', () => {
    it('should trim whitespace from both ends', () => {
      expect(trimText('  hello  ')).toBe('hello');
    });

    it('should return same string when no whitespace', () => {
      expect(trimText('hello')).toBe('hello');
    });
  });

  describe('Abnormal cases', () => {
    it('should return empty string for empty input', () => {
      expect(trimText('')).toBe('');
    });

    it('should return empty string for null', () => {
      expect(trimText(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(trimText(undefined)).toBe('');
    });

    it('should return empty string for whitespace only', () => {
      expect(trimText('   ')).toBe('');
    });

    it('should convert number to string', () => {
      expect(trimText(123)).toBe('123');
    });
  });
});

// ==================== isValidNoSpecialText ====================

describe('isValidNoSpecialText', () => {
  describe('Normal cases', () => {
    it('should return true for text with spaces', () => {
      expect(isValidNoSpecialText('Sản phẩm 123')).toBe(true);
    });

    it('should return true for alphanumeric', () => {
      expect(isValidNoSpecialText('Product123')).toBe(true);
    });

    it('should return true for Vietnamese text', () => {
      expect(isValidNoSpecialText('Nước ngọt')).toBe(true);
    });
  });

  describe('Abnormal cases', () => {
    it('should return false for special characters', () => {
      expect(isValidNoSpecialText('product@123')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidNoSpecialText('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidNoSpecialText(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidNoSpecialText(undefined)).toBe(false);
    });

    it('should return false for whitespace only', () => {
      expect(isValidNoSpecialText('   ')).toBe(false);
    });

    it('should return false for hash symbol', () => {
      expect(isValidNoSpecialText('product#123')).toBe(false);
    });

    it('should return false for symbols like #, $, %, !', () => {
      expect(isValidNoSpecialText('product#123')).toBe(false);
    });
  });
});

// ==================== parseNonNegativeNumber ====================

describe('parseNonNegativeNumber', () => {
  describe('Normal cases', () => {
    it('should parse positive number', () => {
      expect(parseNonNegativeNumber(100)).toBe(100);
    });

    it('should parse string number', () => {
      expect(parseNonNegativeNumber('100')).toBe(100);
    });

    it('should return 0 for zero', () => {
      expect(parseNonNegativeNumber(0)).toBe(0);
    });

    it('should return 0 for empty string', () => {
      expect(parseNonNegativeNumber('')).toBe(0);
    });

    it('should return 0 for null', () => {
      expect(parseNonNegativeNumber(null)).toBe(0);
    });

    it('should return 0 for undefined', () => {
      expect(parseNonNegativeNumber(undefined)).toBe(0);
    });

    it('should parse float', () => {
      expect(parseNonNegativeNumber(99.99)).toBe(99.99);
    });

    it('should parse float string', () => {
      expect(parseNonNegativeNumber('99.99')).toBe(99.99);
    });
  });

  describe('Abnormal cases', () => {
    it('should return null for negative number', () => {
      expect(parseNonNegativeNumber(-50)).toBe(null);
    });

    it('should return null for negative string', () => {
      expect(parseNonNegativeNumber('-50')).toBe(null);
    });

    it('should return null for non-numeric string', () => {
      expect(parseNonNegativeNumber('abc')).toBe(null);
    });

    it('should return null for Infinity', () => {
      expect(parseNonNegativeNumber(Infinity)).toBe(null);
    });
  });
});

// ==================== normalizeImageUrls ====================

describe('normalizeImageUrls', () => {
  describe('Normal cases', () => {
    it('should return valid array as-is', () => {
      expect(normalizeImageUrls(['url1', 'url2', 'url3'])).toEqual(['url1', 'url2', 'url3']);
    });

    it('should filter empty strings', () => {
      expect(normalizeImageUrls(['url1', '', 'url3'])).toEqual(['url1', 'url3']);
    });

    it('should filter whitespace URLs', () => {
      expect(normalizeImageUrls(['url1', '  ', 'url3'])).toEqual(['url1', 'url3']);
    });
  });

  describe('Abnormal cases', () => {
    it('should limit to first 3 URLs', () => {
      const result = normalizeImageUrls(['u1', 'u2', 'u3', 'u4', 'u5']);
      expect(result).toHaveLength(3);
      expect(result).toEqual(['u1', 'u2', 'u3']);
    });

    it('should return empty array for null', () => {
      expect(normalizeImageUrls(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(normalizeImageUrls(undefined)).toEqual([]);
    });

    it('should return empty array for non-array', () => {
      expect(normalizeImageUrls('url1')).toEqual([]);
    });

    it('should filter null values from array', () => {
      expect(normalizeImageUrls(['url1', null, 'url3'])).toEqual(['url1', 'url3']);
    });
  });
});

// ==================== extensionFromMimetype ====================

describe('extensionFromMimetype', () => {
  describe('Normal cases', () => {
    it('should return .jpg for image/jpeg', () => {
      expect(extensionFromMimetype('image/jpeg')).toBe('.jpg');
    });

    it('should return .jpg for image/jpg', () => {
      expect(extensionFromMimetype('image/jpg')).toBe('.jpg');
    });

    it('should return .png for image/png', () => {
      expect(extensionFromMimetype('image/png')).toBe('.png');
    });

    it('should return .webp for image/webp', () => {
      expect(extensionFromMimetype('image/webp')).toBe('.webp');
    });

    it('should return .gif for image/gif', () => {
      expect(extensionFromMimetype('image/gif')).toBe('.gif');
    });

    it('should handle uppercase MIME', () => {
      expect(extensionFromMimetype('IMAGE/PNG')).toBe('.png');
    });
  });

  describe('Abnormal cases', () => {
    it('should return .jpg for unknown mimetype', () => {
      expect(extensionFromMimetype('image/bmp')).toBe('.jpg');
    });

    it('should return .jpg for null', () => {
      expect(extensionFromMimetype(null)).toBe('.jpg');
    });

    it('should return .jpg for undefined', () => {
      expect(extensionFromMimetype(undefined)).toBe('.jpg');
    });

    it('should return .jpg for empty string', () => {
      expect(extensionFromMimetype('')).toBe('.jpg');
    });
  });
});

// ==================== startOfDay ====================

describe('startOfDay', () => {
  describe('Normal cases', () => {
    it('should set time to 00:00:00 for date with time', () => {
      const d = new Date('2024-12-31T14:30:00');
      const result = startOfDay(d);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('should return same date for midnight', () => {
      const d = new Date('2024-12-31T00:00:00');
      const result = startOfDay(d);
      expect(result.getHours()).toBe(0);
    });
  });

  describe('Abnormal cases', () => {
    it('should handle invalid date', () => {
      const d = new Date('invalid');
      const result = startOfDay(d);
      expect(Number.isNaN(result.getTime())).toBe(true);
    });
  });
});

// ==================== validateExpiryDateForWrite ====================

describe('validateExpiryDateForWrite', () => {
  describe('Normal cases', () => {
    it('should accept valid future date', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const result = validateExpiryDateForWrite(futureDate.toISOString());
      expect(result.ok).toBe(true);
      expect(result.date).toBeInstanceOf(Date);
    });

    it('should accept today date', () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const today = `${yyyy}-${mm}-${dd}`;
      const result = validateExpiryDateForWrite(today);
      expect(result.ok).toBe(true);
    });

    it('should return ok true for undefined', () => {
      const result = validateExpiryDateForWrite(undefined);
      expect(result.ok).toBe(true);
      expect(result.date).toBe(undefined);
    });

    it('should return ok true for empty string', () => {
      const result = validateExpiryDateForWrite('');
      expect(result.ok).toBe(true);
      expect(result.date).toBe(undefined);
    });

    it('should accept far future date', () => {
      const result = validateExpiryDateForWrite('2030-12-31');
      expect(result.ok).toBe(true);
    });
  });

  describe('Abnormal cases', () => {
    it('should reject yesterday date', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = validateExpiryDateForWrite(yesterday.toISOString().split('T')[0]);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('hôm nay');
    });

    it('should reject invalid date string', () => {
      const result = validateExpiryDateForWrite('invalid-date');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('không hợp lệ');
    });
  });
});

// ==================== normalizeProduct ====================

describe('normalizeProduct', () => {
  describe('Normal cases', () => {
    it('should normalize full valid product', () => {
      const p = { name: 'Product', base_unit: 'Cái', sale_price: 100 };
      const result = normalizeProduct(p);
      expect(result.base_unit).toBe('Cái');
      expect(result.sale_price).toBe(100);
      expect(result.selling_units).toHaveLength(1);
    });

    it('should set default base_unit', () => {
      const p = { name: 'Product', sale_price: 100 };
      const result = normalizeProduct(p);
      expect(result.base_unit).toBe('Cái');
    });

    it('should create selling_units from sale_price if missing', () => {
      const p = { name: 'Product', sale_price: 100 };
      const result = normalizeProduct(p);
      expect(result.selling_units).toHaveLength(1);
      expect(result.selling_units[0].ratio).toBe(1);
    });

    it('should normalize image_urls', () => {
      const p = { name: 'P', image_urls: ['u1', 'u2'] };
      const result = normalizeProduct(p);
      expect(result.image_urls).toEqual(['u1', 'u2']);
    });

    it('should create selling_units from base_unit if empty array', () => {
      const p = { name: 'P', base_unit: 'Gói', selling_units: [] };
      const result = normalizeProduct(p);
      expect(result.selling_units).toHaveLength(1);
      expect(result.selling_units[0].name).toBe('Gói');
    });

    it('should add base unit with ratio 1 if missing', () => {
      const p = {
        name: 'P',
        base_unit: 'Cái',
        selling_units: [{ name: 'Gói', ratio: 2, sale_price: 50 }],
      };
      const result = normalizeProduct(p);
      expect(result.selling_units).toHaveLength(2);
      expect(result.selling_units.find(u => u.ratio === 1)).toBeDefined();
    });
  });

  describe('Abnormal cases', () => {
    it('should return null for null input', () => {
      expect(normalizeProduct(null)).toBe(null);
    });

    it('should return undefined for undefined input', () => {
      expect(normalizeProduct(undefined)).toBe(undefined);
    });
  });
});

// ==================== getRoleStoreFilter ====================

describe('getRoleStoreFilter', () => {
  describe('Normal cases', () => {
    it('should return empty filter for admin', () => {
      const req = { user: { role: 'admin' } };
      expect(getRoleStoreFilter(req)).toEqual({});
    });

    it('should filter by storeId for manager', () => {
      const req = { user: { role: 'manager', storeId: 'store123' } };
      expect(getRoleStoreFilter(req)).toEqual({ storeId: 'store123' });
    });

    it('should filter by storeId for staff', () => {
      const req = { user: { role: 'staff', storeId: 'store123' } };
      expect(getRoleStoreFilter(req)).toEqual({ storeId: 'store123' });
    });

    it('should return empty filter for unknown role', () => {
      const req = { user: { role: 'unknown' } };
      expect(getRoleStoreFilter(req)).toEqual({});
    });
  });

  describe('Abnormal cases', () => {
    it('should return null for manager without storeId', () => {
      const req = { user: { role: 'manager', storeId: null } };
      expect(getRoleStoreFilter(req)).toBe(null);
    });

    it('should return null for staff without storeId', () => {
      const req = { user: { role: 'staff', storeId: null } };
      expect(getRoleStoreFilter(req)).toBe(null);
    });

    it('should return null for missing user', () => {
      const req = { user: undefined };
      expect(getRoleStoreFilter(req)).toBe(null);
    });

    it('should return null for missing role', () => {
      const req = { user: {} };
      expect(getRoleStoreFilter(req)).toBe(null);
    });
  });
});
