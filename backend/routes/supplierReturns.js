const express = require('express');
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const SupplierReturn = require('../models/SupplierReturn');
const SupplierPaymentAllocation = require('../models/SupplierPaymentAllocation');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function getStoreScopeFilter(req) {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'admin') return {};
    if (!req.user?.storeId || !mongoose.isValidObjectId(req.user.storeId)) return null;
    return { storeId: req.user.storeId };
}

function round2(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
}

router.get('/', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const scopeFilter = getStoreScopeFilter(req);
        if (scopeFilter == null) {
            return res.status(403).json({
                message: 'Tài khoản chưa được gán cửa hàng.',
                code: 'STORE_REQUIRED',
            });
        }
        const { supplier_id, page = '1', limit = '20', from_date, to_date } = req.query || {};
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const filter = { ...scopeFilter };
        if (supplier_id) {
            if (!mongoose.isValidObjectId(supplier_id)) return res.status(400).json({ message: 'supplier_id không hợp lệ' });
            filter.supplier_id = supplier_id;
        }
        if (from_date || to_date) {
            const range = {};
            if (from_date) {
                const from = new Date(from_date);
                if (Number.isNaN(from.getTime())) return res.status(400).json({ message: 'from_date không hợp lệ' });
                range.$gte = from;
            }
            if (to_date) {
                const to = new Date(to_date);
                if (Number.isNaN(to.getTime())) return res.status(400).json({ message: 'to_date không hợp lệ' });
                range.$lte = to;
            }
            filter.created_at = range;
        }

        const total = await SupplierReturn.countDocuments(filter);
        const rows = await SupplierReturn.find(filter)
            .sort({ created_at: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .populate('supplier_id', 'name')
            .populate('created_by', 'fullName email')
            .lean();

        return res.json({
            returns: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1,
        });
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

router.get('/export.xlsx', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const scopeFilter = getStoreScopeFilter(req);
        if (scopeFilter == null) {
            return res.status(403).json({
                message: 'Tài khoản chưa được gán cửa hàng.',
                code: 'STORE_REQUIRED',
            });
        }
        const { supplier_id, from_date, to_date } = req.query || {};
        const filter = { ...scopeFilter };
        if (supplier_id) {
            if (!mongoose.isValidObjectId(supplier_id)) return res.status(400).json({ message: 'supplier_id không hợp lệ' });
            filter.supplier_id = supplier_id;
        }
        if (from_date || to_date) {
            const range = {};
            if (from_date) {
                const from = new Date(from_date);
                if (Number.isNaN(from.getTime())) return res.status(400).json({ message: 'from_date không hợp lệ' });
                range.$gte = from;
            }
            if (to_date) {
                const to = new Date(to_date);
                if (Number.isNaN(to.getTime())) return res.status(400).json({ message: 'to_date không hợp lệ' });
                range.$lte = to;
            }
            filter.created_at = range;
        }
        const rows = await SupplierReturn.find(filter)
            .sort({ created_at: -1 })
            .populate('supplier_id', 'name')
            .populate('created_by', 'fullName email')
            .lean();
        const exportRows = rows.map((row) => ({
            'Thoi gian': row.created_at ? new Date(row.created_at).toLocaleString('vi-VN') : '',
            'Ma phieu': String(row._id || '').slice(-6).toUpperCase(),
            'Nha cung cap': row.supplier_id?.name || '',
            'Gia tri tra': round2(row.total_amount || 0),
            'Ly do': row.reason || '',
            'Ghi chu': row.note || '',
            'Nguoi tao': row.created_by?.fullName || row.created_by?.email || '',
        }));
        const ws = xlsx.utils.json_to_sheet(exportRows);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'PhieuTraNCC');
        const fileBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const stamp = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="phieu-tra-ncc-${stamp}.xlsx"`);
        return res.send(fileBuffer);
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

router.get('/:id', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid supplier return id' });
        }
        const scopeFilter = getStoreScopeFilter(req);
        if (scopeFilter == null) {
            return res.status(403).json({
                message: 'Tài khoản chưa được gán cửa hàng.',
                code: 'STORE_REQUIRED',
            });
        }

        const doc = await SupplierReturn.findOne({ _id: id, ...scopeFilter })
            .populate('supplier_id', 'name phone email')
            .populate('created_by', 'fullName email')
            .populate('approved_by', 'fullName email')
            .populate('items.product_id', 'name sku base_unit')
            .lean();

        if (!doc) return res.status(404).json({ message: 'Supplier return not found' });
        const allocations = doc.payment_id
            ? await SupplierPaymentAllocation.find({ payment_id: doc.payment_id })
                .populate('payable_id', 'source_id total_amount paid_amount remaining_amount status')
                .sort({ created_at: -1 })
                .lean()
            : [];
        return res.json({ supplier_return: doc, allocations });
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;
