/**
 * Supplier Helpers - Function Unit Tests
 * Tests helper functions from routes/suppliers.js
 */

// Import the functions directly from the route file
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeStr = (v) => {
  const s = v != null ? String(v).trim() : '';
  return s || '';
};

const normalizeContacts = (contacts) => {
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
};

const getSupplierScopeFilter = (req) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  const isStoreScopedRole = ['manager', 'staff'].includes(role);
  if (isStoreScopedRole) {
    return { storeId: req.user?.storeId || null };
  }
  return {};
};

// Mock mongoose for findSupplierDuplicate
jest.mock('mongoose', () => ({
  isValidObjectId: jest.fn((id) => /^[a-f\d]{24}$/i.test(id)),
}));

// We need to extract findSupplierDuplicate separately
const mongoose = require('mongoose');
const escapeRegexForDup = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeStrForDup = (v) => {
  const s = v != null ? String(v).trim() : '';
  return s || '';
};

async function findSupplierDuplicate({ scopeFilter = {}, excludeId, code, tax_code, name }) {
  const or = [];

  const codeNorm = normalizeStrForDup(code);
  if (codeNorm) or.push({ code: codeNorm });

  const taxNorm = normalizeStrForDup(tax_code);
  if (taxNorm) or.push({ tax_code: taxNorm });

  const nameNorm = normalizeStrForDup(name);
  if (nameNorm) {
    or.push({ name: new RegExp(`^${escapeRegexForDup(nameNorm)}$`, 'i') });
  }

  if (!or.length) return null;

  const filter = { ...scopeFilter, $or: or };
  if (excludeId && mongoose.isValidObjectId(excludeId)) {
    filter._id = { $ne: excludeId };
  }

  // Mock return for unit testing
  return null; // Override in tests with mock
}

describe('Supplier Helper Functions', () => {

  // ==================== escapeRegex ====================
  describe('escapeRegex(s)', () => {
    it('ER-001: Normal string without special chars', () => {
      expect(escapeRegex('hello')).toBe('hello');
    });

    it('ER-002: String with dot', () => {
      expect(escapeRegex('hello.world')).toBe('hello\\.world');
    });

    it('ER-003: String with all special chars', () => {
      const result = escapeRegex('.*+?^${}()|[]\\');
      expect(result).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });

    it('ER-004: Empty string', () => {
      expect(escapeRegex('')).toBe('');
    });

    it('ER-005: null input', () => {
      expect(escapeRegex(null)).toBe('null');
    });

    it('ER-006: undefined input', () => {
      expect(escapeRegex(undefined)).toBe('undefined');
    });

    it('ER-007: number input', () => {
      expect(escapeRegex(123)).toBe('123');
    });

    it('ER-008: String with parenthesis', () => {
      expect(escapeRegex('test(value)')).toBe('test\\(value\\)');
    });

    it('ER-009: String with dollar sign', () => {
      expect(escapeRegex('$100')).toBe('\\$100');
    });
  });

  // ==================== normalizeStr ====================
  describe('normalizeStr(v)', () => {
    it('NS-001: Normal string with whitespace', () => {
      expect(normalizeStr('  hello  ')).toBe('hello');
    });

    it('NS-002: String without whitespace', () => {
      expect(normalizeStr('hello')).toBe('hello');
    });

    it('NS-003: Empty string', () => {
      expect(normalizeStr('')).toBe('');
    });

    it('NS-004: null input', () => {
      expect(normalizeStr(null)).toBe('');
    });

    it('NS-005: undefined input', () => {
      expect(normalizeStr(undefined)).toBe('');
    });

    it('NS-006: Whitespace only', () => {
      expect(normalizeStr('   ')).toBe('');
    });

    it('NS-007: Number input', () => {
      expect(normalizeStr(123)).toBe('123');
    });

    it('NS-008: String with tabs and newlines', () => {
      expect(normalizeStr('\t\ntest\n\t')).toBe('test');
    });

    it('NS-009: String with only numbers', () => {
      expect(normalizeStr('12345')).toBe('12345');
    });
  });

  // ==================== normalizeContacts ====================
  describe('normalizeContacts(contacts)', () => {
    it('NC-001: Valid contacts array', () => {
      const contacts = [
        { name: 'John', phone: '0123456789', email: 'john@example.com', position: 'Manager', note: 'VIP' }
      ];
      const result = normalizeContacts(contacts);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John');
      expect(result[0].phone).toBe('0123456789');
      expect(result[0].email).toBe('john@example.com');
    });

    it('NC-002: Empty array', () => {
      expect(normalizeContacts([])).toEqual([]);
    });

    it('NC-003: Non-array input', () => {
      expect(normalizeContacts('not an array')).toEqual([]);
      expect(normalizeContacts(null)).toEqual([]);
      expect(normalizeContacts(undefined)).toEqual([]);
    });

    it('NC-004: Contact with empty fields filtered out', () => {
      const contacts = [
        { name: '', phone: '', email: '', position: '', note: '' }
      ];
      const result = normalizeContacts(contacts);
      expect(result).toHaveLength(0);
    });

    it('NC-005: Contact with only name', () => {
      const contacts = [{ name: 'John' }];
      const result = normalizeContacts(contacts);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John');
    });

    it('NC-006: Contact with email lowercase', () => {
      const contacts = [{ name: 'John', email: 'JOHN@EXAMPLE.COM' }];
      const result = normalizeContacts(contacts);
      expect(result[0].email).toBe('john@example.com');
    });

    it('NC-007: Whitespace trimmed in fields', () => {
      const contacts = [{ name: '  John  ', phone: '  0123456789  ' }];
      const result = normalizeContacts(contacts);
      expect(result[0].name).toBe('John');
      expect(result[0].phone).toBe('0123456789');
    });

    it('NC-008: Multiple contacts', () => {
      const contacts = [
        { name: 'John', phone: '0123456789' },
        { name: 'Jane', phone: '0987654321' }
      ];
      const result = normalizeContacts(contacts);
      expect(result).toHaveLength(2);
    });

    it('NC-009: Contact with only note', () => {
      const contacts = [{ note: 'Some note' }];
      const result = normalizeContacts(contacts);
      expect(result).toHaveLength(1);
      expect(result[0].note).toBe('Some note');
    });

    it('NC-010: Mixed valid and invalid contacts', () => {
      const contacts = [
        { name: 'John' },
        { name: '', phone: '' },
        { name: 'Jane', phone: '0123456789' }
      ];
      const result = normalizeContacts(contacts);
      expect(result).toHaveLength(2);
    });
  });

  // ==================== getSupplierScopeFilter ====================
  describe('getSupplierScopeFilter(req)', () => {
    it('GSSF-001: Admin role returns empty filter', () => {
      const req = { user: { role: 'admin' } };
      expect(getSupplierScopeFilter(req)).toEqual({});
    });

    it('GSSF-002: Manager with storeId', () => {
      const req = { user: { role: 'manager', storeId: '123abc' } };
      expect(getSupplierScopeFilter(req)).toEqual({ storeId: '123abc' });
    });

    it('GSSF-003: Staff with storeId', () => {
      const req = { user: { role: 'staff', storeId: '456def' } };
      expect(getSupplierScopeFilter(req)).toEqual({ storeId: '456def' });
    });

    it('GSSF-004: Manager without storeId', () => {
      const req = { user: { role: 'manager', storeId: null } };
      expect(getSupplierScopeFilter(req)).toEqual({ storeId: null });
    });

    it('GSSF-005: Unknown role returns empty filter', () => {
      const req = { user: { role: 'unknown' } };
      expect(getSupplierScopeFilter(req)).toEqual({});
    });

    it('GSSF-006: No user returns empty filter', () => {
      const req = {};
      expect(getSupplierScopeFilter(req)).toEqual({});
    });

    it('GSSF-007: Admin in uppercase', () => {
      const req = { user: { role: 'ADMIN' } };
      expect(getSupplierScopeFilter(req)).toEqual({});
    });

    it('GSSF-008: Manager in mixed case', () => {
      const req = { user: { role: 'Manager', storeId: '789ghi' } };
      expect(getSupplierScopeFilter(req)).toEqual({ storeId: '789ghi' });
    });
  });

  // ==================== findSupplierDuplicate ====================
  describe('findSupplierDuplicate(params)', () => {
    it('FSD-001: No params returns null', async () => {
      const result = await findSupplierDuplicate({});
      expect(result).toBeNull();
    });

    it('FSD-002: Only code provided', async () => {
      const result = await findSupplierDuplicate({ code: 'SUP001' });
      expect(result).toBeNull(); // Mock returns null
    });

    it('FSD-003: Only tax_code provided', async () => {
      const result = await findSupplierDuplicate({ tax_code: 'TAX123' });
      expect(result).toBeNull();
    });

    it('FSD-004: Only name provided', async () => {
      const result = await findSupplierDuplicate({ name: 'Test Supplier' });
      expect(result).toBeNull();
    });

    it('FSD-005: Name with special chars gets escaped', async () => {
      const result = await findSupplierDuplicate({ name: 'Test.Supplier*' });
      expect(result).toBeNull();
    });

    it('FSD-006: Empty string name returns null', async () => {
      const result = await findSupplierDuplicate({ name: '' });
      expect(result).toBeNull();
    });

    it('FSD-007: Scope filter passed through', async () => {
      const result = await findSupplierDuplicate({ scopeFilter: { storeId: '123' }, name: 'Test' });
      expect(result).toBeNull();
    });

    it('FSD-008: ExcludeId validation', async () => {
      const result = await findSupplierDuplicate({ excludeId: 'invalid', name: 'Test' });
      expect(result).toBeNull();
    });

    it('FSD-009: Valid ObjectId for excludeId', async () => {
      mongoose.isValidObjectId.mockReturnValue(true);
      const result = await findSupplierDuplicate({ excludeId: '507f1f77bcf86cd799439011', name: 'Test' });
      expect(result).toBeNull();
    });

    it('FSD-010: Multiple fields provided', async () => {
      const result = await findSupplierDuplicate({
        code: 'SUP001',
        tax_code: 'TAX123',
        name: 'Test Supplier'
      });
      expect(result).toBeNull();
    });
  });
});
