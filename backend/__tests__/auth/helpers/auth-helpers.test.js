const {
  getBearerToken,
  normalizeRoleToThreeTier,
} = require('../../../utils/auth-helpers');
const { blockStoreLockedWrite } = require('../../../middleware/auth');

// ==================== getBearerToken ====================

describe('getBearerToken', () => {
  describe('Normal cases', () => {
    it('should extract token from valid Bearer header', () => {
      const req = { headers: { authorization: 'Bearer abc123xyz' } };
      const result = getBearerToken(req);
      expect(result).toBe('abc123xyz');
    });

    it('should be case-insensitive for Bearer keyword', () => {
      const req = { headers: { authorization: 'bearer abc123' } };
      const result = getBearerToken(req);
      expect(result).toBe('abc123');
    });

    it('should extract token with multiple words after Bearer', () => {
      const req = { headers: { authorization: 'Bearer token.with.many.parts' } };
      const result = getBearerToken(req);
      expect(result).toBe('token.with.many.parts');
    });
  });

  describe('Abnormal cases', () => {
    it('should return empty string for missing authorization header', () => {
      const req = { headers: {} };
      const result = getBearerToken(req);
      expect(result).toBe('');
    });

    it('should return empty string for undefined authorization', () => {
      const req = { headers: { authorization: undefined } };
      const result = getBearerToken(req);
      expect(result).toBe('');
    });

    it('should return empty string for empty authorization', () => {
      const req = { headers: { authorization: '' } };
      const result = getBearerToken(req);
      expect(result).toBe('');
    });

    it('should return empty string for Basic auth', () => {
      const req = { headers: { authorization: 'Basic abc123' } };
      const result = getBearerToken(req);
      expect(result).toBe('');
    });

    it('should return empty string for Bearer without token', () => {
      const req = { headers: { authorization: 'Bearer ' } };
      const result = getBearerToken(req);
      expect(result).toBe('');
    });

    it('should return empty string for Bearer only', () => {
      const req = { headers: { authorization: 'Bearer' } };
      const result = getBearerToken(req);
      expect(result).toBe('');
    });

    it('should return empty string for random string', () => {
      const req = { headers: { authorization: 'randomstring' } };
      const result = getBearerToken(req);
      expect(result).toBe('');
    });
  });
});

// ==================== normalizeRoleToThreeTier ====================

describe('normalizeRoleToThreeTier', () => {
  describe('Normal cases', () => {
    it('should return admin as-is', () => {
      const result = normalizeRoleToThreeTier('admin');
      expect(result).toBe('admin');
    });

    it('should return manager as-is', () => {
      const result = normalizeRoleToThreeTier('manager');
      expect(result).toBe('manager');
    });

    it('should return staff as-is', () => {
      const result = normalizeRoleToThreeTier('staff');
      expect(result).toBe('staff');
    });
  });

  describe('Legacy role normalization', () => {
    it('should normalize warehouse_staff to staff', () => {
      const result = normalizeRoleToThreeTier('warehouse_staff');
      expect(result).toBe('staff');
    });

    it('should normalize warehouse staff (with space) to staff', () => {
      const result = normalizeRoleToThreeTier('warehouse staff');
      expect(result).toBe('staff');
    });

    it('should normalize warehouse to staff', () => {
      const result = normalizeRoleToThreeTier('warehouse');
      expect(result).toBe('staff');
    });

    it('should normalize sales_staff to staff', () => {
      const result = normalizeRoleToThreeTier('sales_staff');
      expect(result).toBe('staff');
    });

    it('should normalize sales staff (with space) to staff', () => {
      const result = normalizeRoleToThreeTier('sales staff');
      expect(result).toBe('staff');
    });

    it('should normalize sales to staff', () => {
      const result = normalizeRoleToThreeTier('sales');
      expect(result).toBe('staff');
    });
  });

  describe('Case insensitivity', () => {
    it('should handle uppercase ADMIN', () => {
      const result = normalizeRoleToThreeTier('ADMIN');
      expect(result).toBe('admin');
    });

    it('should handle uppercase MANAGER', () => {
      const result = normalizeRoleToThreeTier('MANAGER');
      expect(result).toBe('manager');
    });

    it('should handle mixed case Admin', () => {
      const result = normalizeRoleToThreeTier('Admin');
      expect(result).toBe('admin');
    });
  });

  describe('Abnormal cases', () => {
    it('should return empty string for null', () => {
      const result = normalizeRoleToThreeTier(null);
      expect(result).toBe('');
    });

    it('should return empty string for undefined', () => {
      const result = normalizeRoleToThreeTier(undefined);
      expect(result).toBe('');
    });

    it('should return empty string for empty string', () => {
      const result = normalizeRoleToThreeTier('');
      expect(result).toBe('');
    });

    it('should return unknown role for random string', () => {
      const result = normalizeRoleToThreeTier('randomrole');
      expect(result).toBe('randomrole');
    });
  });
});

// ==================== blockStoreLockedWrite ====================

describe('blockStoreLockedWrite', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = { method: 'POST', user: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe('Normal cases (allow)', () => {
    it('should call next() for admin role', () => {
      mockReq.user = { role: 'admin', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should call next() for GET request', () => {
      mockReq.method = 'GET';
      mockReq.user = { role: 'manager', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for HEAD request', () => {
      mockReq.method = 'HEAD';
      mockReq.user = { role: 'manager', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for OPTIONS request', () => {
      mockReq.method = 'OPTIONS';
      mockReq.user = { role: 'manager', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for manager with active store', () => {
      mockReq.user = { role: 'manager', storeId: '123', storeStatus: 'active' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for staff with active store', () => {
      mockReq.user = { role: 'staff', storeId: '123', storeStatus: 'active' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for manager without storeId', () => {
      mockReq.user = { role: 'manager', storeId: null, storeStatus: 'active' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Abnormal cases (block)', () => {
    it('should return 403 for manager with locked store on POST', () => {
      mockReq.user = { role: 'manager', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Cửa hàng của bạn đã tạm bị khóa. Vui lòng liên hệ admin để được hỗ trợ.',
        code: 'STORE_LOCKED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 for staff with locked store on POST', () => {
      mockReq.user = { role: 'staff', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'STORE_LOCKED' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 for manager with locked store on PATCH', () => {
      mockReq.method = 'PATCH';
      mockReq.user = { role: 'manager', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 for manager with locked store on PUT', () => {
      mockReq.method = 'PUT';
      mockReq.user = { role: 'manager', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 for manager with locked store on DELETE', () => {
      mockReq.method = 'DELETE';
      mockReq.user = { role: 'manager', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 for legacy role warehouse_staff with locked store', () => {
      mockReq.user = { role: 'warehouse_staff', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 for legacy role sales_staff with locked store', () => {
      mockReq.user = { role: 'sales_staff', storeId: '123', storeStatus: 'inactive' };
      blockStoreLockedWrite(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
