const express = require('express');
const mongoose = require('mongoose');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Default role → permission-key mappings.
// These are used in the RBAC UI so staff can see + edit role permissions.
// Actual enforcement comes from the `requireRole` middleware.
const DEFAULT_ROLE_PERMISSION_KEYS = {
    admin: [
        'products.view', 'products.manage',
        'categories.view', 'categories.manage',
        'suppliers.view', 'suppliers.manage',
        'stocktakes.view', 'stocktakes.manage',
        'adjustments.view', 'adjustments.manage',
        'invoices.view', 'invoices.manage',
        'returns.view', 'returns.manage',
        'users.manage', 'stores.manage',
    ],
    manager: [
        'products.view', 'products.manage',
        'categories.view', 'categories.manage',
        'suppliers.view', 'suppliers.manage',
        'stocktakes.view', 'stocktakes.manage',
        'adjustments.view', 'adjustments.manage',
        'invoices.view', 'invoices.manage',
        'returns.view', 'returns.manage',
        'users.manage',
    ],
    sales_staff: [
        'invoices.view', 'invoices.manage',
        'returns.view', 'returns.manage',
    ],
    warehouse_staff: [
        'products.view',
        'categories.view',
        'stocktakes.view', 'stocktakes.manage',
        'adjustments.view', 'adjustments.manage',
    ],
};

// GET /api/admin/rbac/roles — list roles with their default permissions
router.get('/roles', requireAuth, requireRole(['admin']), (req, res) => {
    const roles = Object.entries(DEFAULT_ROLE_PERMISSION_KEYS).map(([role, permissions]) => ({
        role,
        permissions,
    }));
    res.json({ roles });
});

module.exports = router;
