const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getBearerToken(req) {
  const h = req.headers.authorization || '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).lean();
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (user.status === 'inactive') return res.status(403).json({ message: 'Tài khoản đã bị vô hiệu hóa' });

    let storeStatus = null;
    let storeApprovalStatus = null;
    if (user.storeId) {
      const Store = require('../models/Store');
      const store = await Store.findById(user.storeId).select('status approval_status').lean();
      storeStatus = store?.status || 'active';
      storeApprovalStatus = store?.approval_status || 'approved';
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      role: user.role,
      storeId: user.storeId ? String(user.storeId) : null,
      storeStatus,
      storeApprovalStatus,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

/**
 * Map mọi role cũ (warehouse_staff, sales_staff, warehouse, sales) về 'staff'
 * để đảm bảo backward compat với dữ liệu user đã có trong DB.
 */
function normalizeRoleToThreeTier(role) {
  const r = String(role || '').toLowerCase().trim();
  if (r === 'warehouse_staff' || r === 'warehouse staff' || r === 'warehouse') return 'staff';
  if (r === 'sales_staff' || r === 'sales staff' || r === 'sales') return 'staff';
  return r;
}

function requireRole(allowedRoles, options = {}) {
  const allowed = (allowedRoles || []).map((r) => String(r).toLowerCase());
  const allowManagerWithoutStore = Boolean(options.allowManagerWithoutStore);
  const allowLockedStoreForManager = Boolean(options.allowLockedStoreForManager);
  const allowApprovalBlockedWriteForManager = Boolean(options.allowApprovalBlockedWriteForManager);
  const canRoleAccess = (role) => {
    if (allowed.includes(role)) return true;
    // Hierarchy: manager inherits staff permissions.
    if (role === 'manager' && allowed.includes('staff')) return true;
    // Admin can access manager/staff endpoints too.
    if (role === 'admin' && (allowed.includes('manager') || allowed.includes('staff'))) return true;
    return false;
  };

  return (req, res, next) => {
    const raw = String(req.user?.role || '').toLowerCase();
    // Chuẩn hóa về 3 tier: admin / manager / staff
    const role = normalizeRoleToThreeTier(raw);

    const isManagerAllowed = allowed.includes('manager');
    const missingManagerStore = role === 'manager' && isManagerAllowed && !req.user?.storeId;
    const isStoreScopedRole = ['manager', 'staff'].includes(role);

    if (missingManagerStore && !allowManagerWithoutStore) {
      return res.status(403).json({
        message: 'Manager chưa có cửa hàng. Vui lòng đăng ký cửa hàng trước khi tiếp tục.',
        code: 'STORE_REQUIRED',
      });
    }

    const method = String(req.method || '').toUpperCase();
    const isReadOnlyMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method);
    const skipLockedForManager = allowLockedStoreForManager && role === 'manager';
    const skipApprovalBlockedForManager = allowApprovalBlockedWriteForManager && role === 'manager';
    const approvalBlockedStatuses = ['draft_profile', 'pending_approval', 'rejected', 'suspended'];
    const isTestEnv = String(process.env.NODE_ENV || '').toLowerCase() === 'test';
    if (
      isStoreScopedRole &&
      !isReadOnlyMethod &&
      approvalBlockedStatuses.includes(String(req.user?.storeApprovalStatus || '').toLowerCase()) &&
      !isTestEnv &&
      !skipApprovalBlockedForManager
    ) {
      return res.status(403).json({
        message: 'Cửa hàng chưa được phê duyệt hoặc đang bị tạm ngưng. Chưa thể thực hiện thao tác ghi dữ liệu.',
        code: 'STORE_APPROVAL_REQUIRED',
      });
    }
    if (isStoreScopedRole && req.user?.storeStatus === 'inactive' && !skipLockedForManager && !isReadOnlyMethod) {
      return res.status(403).json({
        message: 'Cửa hàng của bạn đã bị khóa. Vui lòng liên hệ admin để được hỗ trợ.',
        code: 'STORE_LOCKED',
      });
    }

    if (canRoleAccess(role)) return next();
    return res.status(403).json({ message: 'Forbidden' });
  };
}

function blockStoreLockedWrite(req, res, next) {
  const role = normalizeRoleToThreeTier(req.user?.role);
  const isStoreScopedRole = ['manager', 'staff'].includes(role);
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase());
  if (isStoreScopedRole && isWrite && req.user?.storeStatus === 'inactive') {
    return res.status(403).json({
      message: 'Cửa hàng của bạn đã tạm bị khóa. Vui lòng liên hệ admin để được hỗ trợ.',
      code: 'STORE_LOCKED',
    });
  }
  return next();
}

module.exports = { requireAuth, requireRole, blockStoreLockedWrite };
