/**
 * Stock Adjustment Helpers - Function Unit Tests
 * Tests helper functions from routes/stockAdjustments.js
 */

// Copy the function directly for unit testing
function getRoleStoreFilter(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return {};
  const isStoreScopedRole = ['manager', 'staff'].includes(role);
  if (!isStoreScopedRole) return {};
  const storeId = req.user?.storeId ? String(req.user.storeId) : null;
  if (!storeId) return null;
  return { storeId };
}

describe('Stock Adjustment Helper Functions', () => {

  // ==================== getRoleStoreFilter ====================
  describe('getRoleStoreFilter(req)', () => {
    it('GRSF-001: Admin role returns empty filter', () => {
      const req = { user: { role: 'admin' } };
      expect(getRoleStoreFilter(req)).toEqual({});
    });

    it('GRSF-002: Admin with storeId ignored', () => {
      const req = { user: { role: 'admin', storeId: '507f1f77bcf86cd799439011' } };
      expect(getRoleStoreFilter(req)).toEqual({});
    });

    it('GRSF-003: Manager with storeId returns store filter', () => {
      const req = { user: { role: 'manager', storeId: '507f1f77bcf86cd799439011' } };
      expect(getRoleStoreFilter(req)).toEqual({ storeId: '507f1f77bcf86cd799439011' });
    });

    it('GRSF-004: Staff with storeId returns store filter', () => {
      const req = { user: { role: 'staff', storeId: '507f1f77bcf86cd799439012' } };
      expect(getRoleStoreFilter(req)).toEqual({ storeId: '507f1f77bcf86cd799439012' });
    });

    it('GRSF-005: Manager without storeId returns null', () => {
      const req = { user: { role: 'manager', storeId: null } };
      expect(getRoleStoreFilter(req)).toBeNull();
    });

    it('GRSF-006: Staff without storeId returns null', () => {
      const req = { user: { role: 'staff', storeId: undefined } };
      expect(getRoleStoreFilter(req)).toBeNull();
    });

    it('GRSF-007: No user returns empty filter', () => {
      const req = {};
      expect(getRoleStoreFilter(req)).toEqual({});
    });

    it('GRSF-008: Unknown role returns empty filter', () => {
      const req = { user: { role: 'unknown' } };
      expect(getRoleStoreFilter(req)).toEqual({});
    });

    it('GRSF-009: Role case insensitive - MANAGER', () => {
      const req = { user: { role: 'MANAGER', storeId: '507f1f77bcf86cd799439011' } };
      expect(getRoleStoreFilter(req)).toEqual({ storeId: '507f1f77bcf86cd799439011' });
    });

    it('GRSF-010: Role case insensitive - Staff', () => {
      const req = { user: { role: 'Staff', storeId: '507f1f77bcf86cd799439012' } };
      expect(getRoleStoreFilter(req)).toEqual({ storeId: '507f1f77bcf86cd799439012' });
    });

    it('GRSF-011: Manager with empty string storeId returns null', () => {
      const req = { user: { role: 'manager', storeId: '' } };
      expect(getRoleStoreFilter(req)).toBeNull();
    });

    it('GRSF-012: Manager with numeric storeId converted to string', () => {
      const req = { user: { role: 'manager', storeId: 123456789012 } };
      expect(getRoleStoreFilter(req)).toEqual({ storeId: '123456789012' });
    });
  });
});
