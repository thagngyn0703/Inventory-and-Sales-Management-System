import React, { useState, useMemo } from 'react';
import { createProductRequest } from '../../services/productsApi';
import './WarehouseProductCreateModal.css';

const PRODUCT_BASE_UNITS = ['Cái', 'Chai', 'Lon', 'Thùng', 'Hộp', 'Kg', 'Gói', 'Lít'];

const defaultSellingUnit = () => ({ name: 'Cái', ratio: 1, sale_price: '' });

const defaultForm = {
    name: '',
    sku: '',
    barcode: '',
    cost_price: '',
    stock_qty: '',
    reorder_level: '',
    base_unit: 'Cái',
    selling_units: [defaultSellingUnit()],
};

export default function WarehouseProductCreateModal({ onClose, onSuccess }) {
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const update = (field, value) => {
        setForm((prev) => {
            const next = { ...prev, [field]: value };
            if (field === 'base_unit') {
                next.selling_units = prev.selling_units.map((u) =>
                    Number(u.ratio) === 1 ? { ...u, name: value } : u
                );
            }
            return next;
        });
        setError('');
    };

    const updateSellingUnit = (index, field, value) => {
        setForm((prev) => ({
            ...prev,
            selling_units: prev.selling_units.map((u, i) =>
                i === index ? { ...u, [field]: value } : u
            ),
        }));
        setError('');
    };

    const addSellingUnit = () => {
        setForm((prev) => ({
            ...prev,
            selling_units: [...prev.selling_units, { name: prev.base_unit || 'Cái', ratio: '', sale_price: '' }],
        }));
    };

    const removeSellingUnit = (index) => {
        setForm((prev) => {
            const next = prev.selling_units.filter((_, i) => i !== index);
            const hasBase = next.some((u) => Number(u.ratio) === 1);
            if (!hasBase && next.length > 0) {
                next[0].ratio = 1;
            }
            return { ...prev, selling_units: next.length ? next : [defaultSellingUnit()] };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) {
            setError('Vui lòng nhập tên sản phẩm.');
            return;
        }
        if (!form.sku.trim()) {
            setError('Vui lòng nhập SKU.');
            return;
        }
        const units = form.selling_units
            .filter((u) => u.name && String(u.ratio).trim() !== '' && String(u.sale_price).trim() !== '')
            .map((u) => ({
                name: String(u.name).trim(),
                ratio: Number(u.ratio) > 0 ? Number(u.ratio) : 1,
                sale_price: Number(u.sale_price) >= 0 ? Number(u.sale_price) : 0,
            }));
        if (units.length === 0) {
            setError('Vui lòng thêm ít nhất một đơn vị bán với giá.');
            return;
        }
        const hasBase = units.some((u) => u.ratio === 1);
        if (!hasBase) {
            units.unshift({ name: form.base_unit || 'Cái', ratio: 1, sale_price: units[0]?.sale_price ?? 0 });
        }

        setLoading(true);
        setError('');
        try {
            const createdRequest = await createProductRequest({
                name: form.name.trim(),
                sku: form.sku.trim(),
                barcode: form.barcode ? String(form.barcode).trim() : undefined,
                cost_price: Number(form.cost_price) || 0,
                stock_qty: Number(form.stock_qty) || 0,
                reorder_level: Number(form.reorder_level) || 0,
                base_unit: form.base_unit || 'Cái',
                selling_units: units,
                note: form.note
            });
            onSuccess(createdRequest);
        } catch (err) {
            setError(err.message || 'Không thể gửi yêu cầu tạo sản phẩm.');
            setLoading(false);
        }
    };

    return (
        <div className="warehouse-modal-overlay">
            <div className="warehouse-modal-content">
                <div className="warehouse-modal-header">
                    <div>
                        <h2 className="warehouse-modal-title">Thêm sản phẩm mới</h2>
                        <p className="warehouse-modal-subtitle">Sản phẩm sẽ được lưu ở trạng thái chờ duyệt và có thể đính kèm vào phiếu nhập.</p>
                    </div>
                    <button type="button" className="warehouse-modal-close" onClick={onClose}>&times;</button>
                </div>
                
                <div className="warehouse-modal-body">
                    {error && (
                        <div className="warehouse-alert warehouse-alert-error" role="alert" style={{ marginBottom: 16 }}>
                            {error}
                        </div>
                    )}
                    
                    <form id="product-create-form" onSubmit={handleSubmit}>
                        <div className="warehouse-form-row">
                            <div className="warehouse-form-group">
                                <label>Tên sản phẩm <span className="required">*</span></label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => update('name', e.target.value)}
                                    placeholder="Nhập tên sản phẩm"
                                />
                            </div>
                            <div className="warehouse-form-group">
                                <label>SKU <span className="required">*</span></label>
                                <input
                                    type="text"
                                    value={form.sku}
                                    onChange={(e) => update('sku', e.target.value)}
                                    placeholder="Mã SKU"
                                />
                            </div>
                        </div>

                        <div className="warehouse-form-row">
                            <div className="warehouse-form-group">
                                <label>Barcode</label>
                                <input
                                    type="text"
                                    value={form.barcode}
                                    onChange={(e) => update('barcode', e.target.value)}
                                    placeholder="Mã vạch (tùy chọn)"
                                />
                            </div>
                        </div>

                        <div className="warehouse-form-row">
                            <div className="warehouse-form-group">
                                <label>Đơn vị tồn kho (gốc)</label>
                                <select
                                    value={form.base_unit}
                                    onChange={(e) => update('base_unit', e.target.value)}
                                >
                                    {PRODUCT_BASE_UNITS.map((u) => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="warehouse-form-group">
                                <label>Giá vốn (₫) / 1 đơn vị gốc</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1000"
                                    value={form.cost_price}
                                    onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="warehouse-selling-units-section">
                            <div className="warehouse-selling-units-header">
                                <h3>Đơn vị bán & giá</h3>
                                <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={addSellingUnit} style={{ padding: '6px 12px', fontSize: 13 }}>
                                    + Thêm đơn vị bán
                                </button>
                            </div>
                            <p className="warehouse-form-hint">
                                Tỉ lệ = số đơn vị gốc (vd: 1 Thùng = 24 Lon → tỉ lệ 24). Phải có ít nhất 1 đơn vị với tỉ lệ 1.
                            </p>
                            
                            <table className="warehouse-selling-units-table">
                                <thead>
                                    <tr>
                                        <th>Đơn vị</th>
                                        <th>Tỉ lệ</th>
                                        <th>Giá bán (₫)</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.selling_units.map((u, i) => (
                                        <tr key={i}>
                                            <td>
                                                <input
                                                    type="text"
                                                    value={u.name}
                                                    onChange={(e) => updateSellingUnit(i, 'name', e.target.value)}
                                                    placeholder="vd: Lon"
                                                    className="warehouse-selling-unit-input"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={u.ratio}
                                                    onChange={(e) => updateSellingUnit(i, 'ratio', e.target.value)}
                                                    placeholder="1"
                                                    className="warehouse-selling-unit-input"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1000"
                                                    value={u.sale_price}
                                                    onChange={(e) => updateSellingUnit(i, 'sale_price', e.target.value)}
                                                    placeholder="0"
                                                    className="warehouse-selling-unit-input"
                                                />
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="warehouse-btn-icon"
                                                    onClick={() => removeSellingUnit(i)}
                                                    disabled={form.selling_units.length <= 1}
                                                >
                                                    Xóa
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="warehouse-form-row">
                            <div className="warehouse-form-group">
                                <label>Tồn kho ban đầu (theo đơn vị gốc)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.stock_qty}
                                    onChange={(e) => update('stock_qty', e.target.value)}
                                    placeholder="vd: 24"
                                />
                            </div>
                            <div className="warehouse-form-group">
                                <label>Mức tồn tối thiểu</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.reorder_level}
                                    onChange={(e) => update('reorder_level', e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="warehouse-form-row">
                            <div className="warehouse-form-group" style={{ width: '100%' }}>
                                <label>Ghi chú cho quản lý</label>
                                <input
                                    type="text"
                                    value={form.note || ''}
                                    onChange={(e) => update('note', e.target.value)}
                                    placeholder="Vd: Vui lòng duyệt gấp để nhập hàng..."
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>
                    </form>
                </div>
                
                <div className="warehouse-modal-footer">
                    <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={onClose} disabled={loading}>
                        Hủy
                    </button>
                    <button
                        type="submit"
                        form="product-create-form"
                        className="warehouse-btn warehouse-btn-primary"
                        disabled={loading}
                        onClick={handleSubmit}
                    >
                        {loading ? 'Đang gửi...' : 'Gửi yêu cầu tạo sản phẩm'}
                    </button>
                </div>
            </div>
        </div>
    );
}
