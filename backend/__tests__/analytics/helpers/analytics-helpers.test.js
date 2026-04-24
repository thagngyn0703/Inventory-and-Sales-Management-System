/**
 * Analytics Helpers - Function Unit Tests
 * Tests helper functions from routes/analytics.js
 */

const REPORT_TZ = 'Asia/Ho_Chi_Minh';

// Copy the functions directly for unit testing
function getVNCalendarDate(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const y = parseInt(parts.find((p) => p.type === 'year').value, 10);
  const m = parseInt(parts.find((p) => p.type === 'month').value, 10);
  const day = parseInt(parts.find((p) => p.type === 'day').value, 10);
  return { y, m, day };
}

function vnYmdKey(y, mo, d) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function startOfVNCalendarDay(y, mo, d) {
  return new Date(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00+07:00`);
}

function endOfVNCalendarDay(y, mo, d) {
  return new Date(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T23:59:59.999+07:00`);
}

function addDaysVNCalendar(y, mo, d, deltaDays) {
  const noon = new Date(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00+07:00`);
  return getVNCalendarDate(new Date(noon.getTime() + deltaDays * 86400000));
}

function getVNYearMonth(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  return {
    y: parseInt(parts.find((p) => p.type === 'year').value, 10),
    m: parseInt(parts.find((p) => p.type === 'month').value, 10),
  };
}

function startOfVNMonth(y, mo) {
  return new Date(`${y}-${String(mo).padStart(2, '0')}-01T00:00:00+07:00`);
}

function subtractVNMonths(y, mo, monthsBack) {
  let yy = y;
  let mm = mo - monthsBack;
  while (mm < 1) {
    mm += 12;
    yy -= 1;
  }
  return { y: yy, m: mm };
}

// Mock mongoose for getStoreFilter and getManagerStoreId
jest.mock('mongoose', () => ({
  isValidObjectId: jest.fn((id) => /^[a-f\d]{24}$/i.test(id)),
  Types: {
    ObjectId: jest.fn((id) => id),
  },
}));

function getStoreFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  const storeId = req.user?.storeId;
  if (!storeId) return null;
  return { $or: [{ store_id: req.user?.storeId }, { storeId: req.user?.storeId }] };
}

function getManagerStoreId(req) {
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId || !/^[a-f\d]{24}$/i.test(storeId)) return null;
  return storeId;
}

function parseDateRange(query) {
  const now = new Date();
  let from, to;

  if (query.from) {
    from = new Date(query.from);
    from.setHours(0, 0, 0, 0);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  if (query.to) {
    to = new Date(query.to);
    to.setHours(23, 59, 59, 999);
  } else {
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
  }

  return { from, to };
}

describe('Analytics Helper Functions', () => {

  // ==================== getVNCalendarDate ====================
  describe('getVNCalendarDate(d)', () => {
    it('GVCD-001: Returns correct date parts for known date', () => {
      const d = new Date('2024-12-25T12:00:00Z');
      const result = getVNCalendarDate(d);
      expect(result.y).toBe(2024);
      expect(result.m).toBe(12);
      expect(result.day).toBe(25);
    });

    it('GVCD-002: Handles date without timezone offset', () => {
      const d = new Date('2024-06-15');
      const result = getVNCalendarDate(d);
      expect(result.y).toBe(2024);
      expect(result.m).toBe(6);
      expect(result.day).toBe(15);
    });

    it('GVCD-003: January date', () => {
      const d = new Date('2024-01-01T00:00:00Z');
      const result = getVNCalendarDate(d);
      expect(result.m).toBe(1);
    });

    it('GVCD-004: December date in VN timezone (UTC+7 shift)', () => {
      // 2024-12-31T23:59:59Z = 2025-01-01T06:59:59+07:00 in VN
      const d = new Date('2024-12-31T23:59:59Z');
      const result = getVNCalendarDate(d);
      // VN timezone (UTC+7) shifts this to next day
      expect(result.m).toBe(1);
      expect(result.day).toBe(1);
    });

    it('GVCD-005: Uses current date when no param', () => {
      const result = getVNCalendarDate();
      expect(result).toHaveProperty('y');
      expect(result).toHaveProperty('m');
      expect(result).toHaveProperty('day');
    });
  });

  // ==================== vnYmdKey ====================
  describe('vnYmdKey(y, mo, d)', () => {
    it('VYMDK-001: Formats correctly with padding', () => {
      expect(vnYmdKey(2024, 1, 1)).toBe('2024-01-01');
      expect(vnYmdKey(2024, 12, 31)).toBe('2024-12-31');
    });

    it('VYMDK-002: Pads single digit month and day', () => {
      expect(vnYmdKey(2024, 5, 9)).toBe('2024-05-09');
    });

    it('VYMDK-003: Does not pad already 2-digit values', () => {
      expect(vnYmdKey(2024, 11, 22)).toBe('2024-11-22');
    });
  });

  // ==================== startOfVNCalendarDay ====================
  describe('startOfVNCalendarDay(y, mo, d)', () => {
    it('SOVCD-001: Returns midnight in VN timezone', () => {
      const result = startOfVNCalendarDay(2024, 6, 15);
      expect(result.toISOString()).toBe('2024-06-14T17:00:00.000Z'); // UTC+7 = UTC-17h
    });

    it('SOVCD-002: Start of year', () => {
      const result = startOfVNCalendarDay(2024, 1, 1);
      expect(result.getUTCHours()).toBe(17); // 00:00 VN = 17:00 UTC previous day
    });
  });

  // ==================== endOfVNCalendarDay ====================
  describe('endOfVNCalendarDay(y, mo, d)', () => {
    it('EOVCD-001: Returns end of day in VN timezone', () => {
      const result = endOfVNCalendarDay(2024, 6, 15);
      const iso = result.toISOString();
      expect(iso).toContain('T16:59:59');
    });

    it('EOVCD-002: Last day of month', () => {
      const result = endOfVNCalendarDay(2024, 6, 30);
      expect(result.getUTCDate()).toBe(30);
    });
  });

  // ==================== addDaysVNCalendar ====================
  describe('addDaysVNCalendar(y, mo, d, deltaDays)', () => {
    it('ADVNC-001: Add 1 day', () => {
      const result = addDaysVNCalendar(2024, 6, 15, 1);
      expect(result.day).toBe(16);
    });

    it('ADVNC-002: Add 7 days', () => {
      const result = addDaysVNCalendar(2024, 6, 15, 7);
      expect(result.day).toBe(22);
    });

    it('ADVNC-003: Subtract 1 day', () => {
      const result = addDaysVNCalendar(2024, 6, 15, -1);
      expect(result.day).toBe(14);
    });

    it('ADVNC-004: Cross month boundary', () => {
      const result = addDaysVNCalendar(2024, 6, 30, 1);
      expect(result.m).toBe(7);
      expect(result.day).toBe(1);
    });

    it('ADVNC-005: Cross year boundary', () => {
      const result = addDaysVNCalendar(2024, 12, 31, 1);
      expect(result.y).toBe(2025);
      expect(result.m).toBe(1);
      expect(result.day).toBe(1);
    });

    it('ADVNC-006: Subtract crosses month', () => {
      const result = addDaysVNCalendar(2024, 7, 1, -1);
      expect(result.m).toBe(6);
      expect(result.day).toBe(30);
    });
  });

  // ==================== getVNYearMonth ====================
  describe('getVNYearMonth(d)', () => {
    it('GVYM-001: Returns year and month', () => {
      const d = new Date('2024-12-25');
      const result = getVNYearMonth(d);
      expect(result.y).toBe(2024);
      expect(result.m).toBe(12);
    });

    it('GVYM-002: January', () => {
      const d = new Date('2024-01-15');
      const result = getVNYearMonth(d);
      expect(result.m).toBe(1);
    });
  });

  // ==================== startOfVNMonth ====================
  describe('startOfVNMonth(y, mo)', () => {
    it('SOVM-001: Returns valid Date object for June', () => {
      const result = startOfVNMonth(2024, 6);
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
    });

    it('SOVM-002: Returns valid Date for January (timezone shift)', () => {
      const result = startOfVNMonth(2024, 1);
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
    });
  });

  // ==================== subtractVNMonths ====================
  describe('subtractVNMonths(y, mo, monthsBack)', () => {
    it('SVM-001: Subtract 1 month', () => {
      const result = subtractVNMonths(2024, 6, 1);
      expect(result.y).toBe(2024);
      expect(result.m).toBe(5);
    });

    it('SVM-002: Subtract 3 months', () => {
      const result = subtractVNMonths(2024, 6, 3);
      expect(result.y).toBe(2024);
      expect(result.m).toBe(3);
    });

    it('SVM-012: Subtract 12 months', () => {
      const result = subtractVNMonths(2024, 6, 12);
      expect(result.y).toBe(2023);
      expect(result.m).toBe(6);
    });

    it('SVM-003: Cross year boundary (Jan)', () => {
      const result = subtractVNMonths(2024, 3, 3);
      expect(result.y).toBe(2023);
      expect(result.m).toBe(12);
    });

    it('SVM-004: Cross year boundary (Feb)', () => {
      const result = subtractVNMonths(2024, 2, 2);
      expect(result.y).toBe(2023);
      expect(result.m).toBe(12);
    });

    it('SVM-005: Subtract 0 months', () => {
      const result = subtractVNMonths(2024, 6, 0);
      expect(result.y).toBe(2024);
      expect(result.m).toBe(6);
    });

    it('SVM-006: Large subtraction', () => {
      const result = subtractVNMonths(2024, 6, 18);
      expect(result.y).toBe(2022);
      expect(result.m).toBe(12);
    });
  });

  // ==================== getStoreFilter ====================
  describe('getStoreFilter(req)', () => {
    it('GSF-001: Admin returns empty filter', () => {
      const req = { user: { role: 'admin' } };
      expect(getStoreFilter(req)).toEqual({});
    });

    it('GSF-002: Manager with storeId', () => {
      const req = { user: { role: 'manager', storeId: '507f1f77bcf86cd799439011' } };
      const result = getStoreFilter(req);
      expect(result).toHaveProperty('$or');
    });

    it('GSF-003: Staff with storeId', () => {
      const req = { user: { role: 'staff', storeId: '507f1f77bcf86cd799439011' } };
      const result = getStoreFilter(req);
      expect(result).toHaveProperty('$or');
    });

    it('GSF-004: Manager without storeId returns null', () => {
      const req = { user: { role: 'manager', storeId: null } };
      expect(getStoreFilter(req)).toBeNull();
    });

    it('GSF-005: No user returns null', () => {
      const req = {};
      expect(getStoreFilter(req)).toBeNull();
    });
  });

  // ==================== getManagerStoreId ====================
  describe('getManagerStoreId(req)', () => {
    it('GMSI-001: Valid storeId returns it', () => {
      const req = { user: { storeId: '507f1f77bcf86cd799439011' } };
      expect(getManagerStoreId(req)).toBe('507f1f77bcf86cd799439011');
    });

    it('GMSI-002: Invalid ObjectId returns null', () => {
      const req = { user: { storeId: 'invalid' } };
      expect(getManagerStoreId(req)).toBeNull();
    });

    it('GMSI-003: null storeId returns null', () => {
      const req = { user: { storeId: null } };
      expect(getManagerStoreId(req)).toBeNull();
    });

    it('GMSI-004: No storeId returns null', () => {
      const req = { user: {} };
      expect(getManagerStoreId(req)).toBeNull();
    });
  });

  // ==================== parseDateRange ====================
  describe('parseDateRange(query)', () => {
    it('PDR-001: With from/to params', () => {
      const query = { from: '2024-06-01', to: '2024-06-30' };
      const result = parseDateRange(query);
      expect(result.from.getFullYear()).toBe(2024);
      expect(result.to.getFullYear()).toBe(2024);
    });

    it('PDR-002: Empty query uses defaults', () => {
      const result = parseDateRange({});
      expect(result.from).toBeDefined();
      expect(result.to).toBeDefined();
    });

    it('PDR-003: Only from param', () => {
      const query = { from: '2024-06-01' };
      const result = parseDateRange(query);
      expect(result.from.getFullYear()).toBe(2024);
    });

    it('PDR-004: Only to param', () => {
      const query = { to: '2024-06-30' };
      const result = parseDateRange(query);
      expect(result.to.getFullYear()).toBe(2024);
    });

    it('PDR-005: From date set to midnight', () => {
      const query = { from: '2024-06-15T14:30:00' };
      const result = parseDateRange(query);
      expect(result.from.getHours()).toBe(0);
      expect(result.from.getMinutes()).toBe(0);
    });

    it('PDR-006: To date set to end of day', () => {
      const query = { to: '2024-06-15' };
      const result = parseDateRange(query);
      expect(result.to.getHours()).toBe(23);
      expect(result.to.getMinutes()).toBe(59);
    });
  });
});
