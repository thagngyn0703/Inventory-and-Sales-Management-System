const express = require('express');
const mongoose = require('mongoose');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_PERMISSIONS = [
  { key: 'products.view', name: 'Xem sản phẩm', module: 'products', action: 'view' },
  { key: 'products.manage', name: 'Quản lý sản phẩm', module: 'products', action: 'manage' },
  { key: 'suppliers.manage', name: 'Quản lý nhà cung cấp', module: 'suppliers', action: 'manage' },
  { key: 'stocktakes.manage', name: 'Quản lý kiểm kê', module: 'stocktakes', action: 'manage' },
  { key: 'invoices.manage', name: 'Quản lý hóa đơn', module: 'invoices', action: 'manage' },
  { key: 'sales.manage', name: 'Bán hàng', module: 'sales', action: 'manage' },
  { key: 'staff.manage', name: 'Quản lý nhân viên', module: 'staff', action: 'manage' },
  { key: 'stores.manage', name: 'Quản lý cửa hàng', module: 'stores', action: 'manage' },
  { key: 'rbac.manage', name: 'Quản lý RBAC', module: 'rbac', action: 'manage' },
];

const DEFAULT_ROLE_PERMISSION_KEYS = {
  admin: DEFAULT_PERMISSIONS.map((p) => p.key),
  manager: ['products.view', 'products.manage', 'suppliers.manage', 'stocktakes.manage', 'invoices.manage', 'staff.manage'],
  warehouse_staff: ['products.view', 'stocktakes.manage', 'invoices.manage'],
  sales_staff: ['products.view', 'invoices.manage', 'sales.manage'],
};

async function ensureDefaults() {
  for (const p of DEFAULT_PERMISSIONS) {
    await Permission.updateOne(
      { key: p.key },
      { $setOnInsert: { ...p, description: '' } },
      { upsert: true }
    );
  }
  for (const [roleName, perms] of Object.entries(DEFAULT_ROLE_PERMISSION_KEYS)) {
    await Role.updateOne(
      { name: roleName },
      {
        $set: {
          description: `System role: ${roleName}`,
          permissions: perms,
          isSystem: true,
        },
        $setOnInsert: { name: roleName, status: 'active' },
      },
      { upsert: true }
    );
  }
}

router.get('/permissions', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    await ensureDefaults();
    const permissions = await Permission.find({}).sort({ module: 1, action: 1 }).lean();
    return res.json({ permissions });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/roles', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    await ensureDefaults();
    const roles = await Role.find({}).sort({ isSystem: -1, name: 1 }).lean();
    return res.json({ roles });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/roles', requireAuth, requireRole(['admin']), async (req, res) => {
  return res.status(403).json({
    message: 'Hệ thống hiện chỉ sử dụng role cố định (admin, manager, warehouse_staff, sales_staff). Không hỗ trợ tạo role mới.',
  });
});

router.put('/roles/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid role id' });
    const { description, permissions, status } = req.body || {};
    const role = await Role.findById(id);
    if (!role) return res.status(404).json({ message: 'Role not found' });
    if (role.name === 'admin' && status === 'inactive') {
      return res.status(400).json({ message: 'Không thể khóa role admin' });
    }
    if (description !== undefined) role.description = String(description || '').trim();
    if (permissions !== undefined) role.permissions = Array.isArray(permissions) ? permissions.map((x) => String(x).trim()) : [];
    if (status !== undefined) role.status = status === 'inactive' ? 'inactive' : 'active';
    await role.save();
    return res.json({ role: role.toObject() });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/roles/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  return res.status(403).json({
    message: 'Hệ thống hiện chỉ sử dụng role cố định. Không hỗ trợ xóa role.',
  });
});

router.get('/users', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const users = await User.find({})
      .sort({ createdAt: -1 })
      .select('_id fullName email role storeId createdAt')
      .lean();
    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/users/:id/role', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid user id' });
    const allowedRoles = ['admin', 'manager', 'warehouse_staff', 'sales_staff'];
    if (!allowedRoles.includes(String(role || ''))) return res.status(400).json({ message: 'Role không hợp lệ' });
    const user = await User.findByIdAndUpdate(id, { role }, { new: true }).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

