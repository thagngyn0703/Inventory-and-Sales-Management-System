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

    req.user = {
      id: String(user._id),
      email: user.email,
      role: user.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

function requireRole(allowedRoles) {
  const baseAllowed = (allowedRoles || []).map((r) => String(r).toLowerCase());
  const allowed = [...baseAllowed];
  if (baseAllowed.includes('warehouse')) allowed.push('warehouse_staff');
  if (baseAllowed.includes('sales')) allowed.push('sales_staff');
  const normalizeRole = (role) => {
    const r = String(role || '').toLowerCase();
    if (r === 'warehouse_staff' || r === 'warehouse staff') return 'warehouse';
    if (r === 'sales_staff' || r === 'sales staff') return 'sales';
    return r;
  };
  return (req, res, next) => {
    const role = normalizeRole(req.user?.role) || String(req.user?.role || '').toLowerCase();
    if (allowed.includes(role)) return next();
    return res.status(403).json({ message: 'Forbidden' });
  };
}

module.exports = { requireAuth, requireRole };

