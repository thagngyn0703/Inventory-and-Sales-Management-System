const mongoose = require('mongoose');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { createAdminUser, createManagerUser, createStaffUser, createManagerWithStore, generateTestToken } = require('../fixtures/users');

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe('requireAuth', () => {
    it('should return 401 if no token provided', async () => {
      await requireAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';

      await requireAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if user not found', async () => {
      const nonExistentUserId = new mongoose.Types.ObjectId();
      const token = generateTestToken({ _id: nonExistentUserId, email: 'test@example.com', role: 'admin' });
      mockReq.headers.authorization = `Bearer ${token}`;

      await requireAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next() and set req.user for valid token', async () => {
      const user = await createAdminUser();
      const token = generateTestToken(user);
      mockReq.headers.authorization = `Bearer ${token}`;

      await requireAuth(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user.id).toBe(String(user._id));
      expect(mockReq.user.email).toBe(user.email);
      expect(mockReq.user.role).toBe('admin');
    });

    it('should return 403 for inactive user', async () => {
      const user = await createAdminUser({ status: 'inactive' });
      const token = generateTestToken(user);
      mockReq.headers.authorization = `Bearer ${token}`;

      await requireAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Tài khoản đã bị vô hiệu hóa' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should return 403 if no user in request', () => {
      const middleware = requireRole(['admin']);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Forbidden' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 if user role not in allowed list', () => {
      mockReq.user = { role: 'staff' };
      const middleware = requireRole(['admin', 'manager']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Forbidden' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next() if user role is allowed', () => {
      mockReq.user = { role: 'admin' };
      const middleware = requireRole(['admin', 'manager']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 403 with STORE_REQUIRED if manager has no store', () => {
      mockReq.user = { role: 'manager', storeId: null };
      const middleware = requireRole(['manager', 'staff', 'admin']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Manager chưa có cửa hàng'),
        code: 'STORE_REQUIRED',
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow manager without store with allowManagerWithoutStore option', () => {
      mockReq.user = { role: 'manager', storeId: null };
      const middleware = requireRole(['manager', 'staff', 'admin'], { allowManagerWithoutStore: true });

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 if store is inactive for write operations', () => {
      mockReq.user = { role: 'manager', storeId: new mongoose.Types.ObjectId(), storeStatus: 'inactive' };
      mockReq.method = 'POST';
      const middleware = requireRole(['manager', 'staff', 'admin']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'STORE_LOCKED',
      }));
    });

    it('should allow GET requests even if store is inactive', () => {
      mockReq.user = { role: 'manager', storeId: new mongoose.Types.ObjectId(), storeStatus: 'inactive' };
      mockReq.method = 'GET';
      const middleware = requireRole(['manager', 'staff', 'admin']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should normalize warehouse_staff to staff role', () => {
      mockReq.user = { role: 'warehouse_staff' };
      const middleware = requireRole(['staff']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
