import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { createProduct } from '../../services/productsApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const defaultForm = {
    name: '',
    sku: '',
    barcode: '',
    cost_price: '',
    sale_price: '',
    stock_qty: '',
    reorder_level: '',
    status: 'active',
};

export default function ManagerProductCreate() {
    const navigate = useNavigate();
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const update = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError('');
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
        setLoading(true);
        setError('');
        try {
            await createProduct({
                name: form.name.trim(),
                sku: form.sku.trim(),
                barcode: form.barcode ? String(form.barcode).trim() : undefined,
                cost_price: Number(form.cost_price) || 0,
                sale_price: Number(form.sale_price) || 0,
                stock_qty: Number(form.stock_qty) || 0,
                reorder_level: Number(form.reorder_level) || 0,
                status: form.status === 'inactive' ? 'inactive' : 'active',
            });
            navigate('/manager/products', { state: { success: 'Thêm sản phẩm thành công.' } });
        } catch (err) {
            setError(err.message || 'Không thể tạo sản phẩm.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="manager-page-with-sidebar">
            <ManagerSidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <div className="manager-topbar-search-wrap" />
                    <div className="manager-topbar-actions">
                        <button type="button" className="manager-icon-btn" aria-label="Thông báo">
                            <i className="fa-solid fa-bell" />
                        </button>
                        <div className="manager-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản lý</span>
                        </div>
                    </div>
                </header>

                <div className="manager-content">
                    <div className="manager-products-header">
                        <div>
                            <h1 className="manager-page-title">Thêm sản phẩm</h1>
                            <p className="manager-page-subtitle">Tạo sản phẩm mới trong kho</p>
                        </div>
                        <button
                            type="button"
                            className="manager-btn-secondary"
                            onClick={() => navigate('/manager/products')}
                        >
                            <i className="fa-solid fa-arrow-left" /> Quay lại
                        </button>
                    </div>

                    {error && (
                        <div className="manager-products-error">{error}</div>
                    )}

                    <div className="manager-panel-card manager-product-form-card">
                        <form onSubmit={handleSubmit} className="manager-product-form">
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Tên sản phẩm <span className="required">*</span></label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => update('name', e.target.value)}
                                        placeholder="Nhập tên sản phẩm"
                                    />
                                </div>
                                <div className="manager-form-group">
                                    <label>SKU <span className="required">*</span></label>
                                    <input
                                        type="text"
                                        value={form.sku}
                                        onChange={(e) => update('sku', e.target.value)}
                                        placeholder="Mã SKU"
                                    />
                                </div>
                            </div>
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Barcode</label>
                                    <input
                                        type="text"
                                        value={form.barcode}
                                        onChange={(e) => update('barcode', e.target.value)}
                                        placeholder="Mã vạch (tùy chọn)"
                                    />
                                </div>
                                <div className="manager-form-group">
                                    <label>Trạng thái</label>
                                    <select
                                        value={form.status}
                                        onChange={(e) => update('status', e.target.value)}
                                    >
                                        <option value="active">Đang bán</option>
                                        <option value="inactive">Ngừng bán</option>
                                    </select>
                                </div>
                            </div>
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Giá vốn (₫)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1000"
                                        value={form.cost_price}
                                        onChange={(e) => update('cost_price', e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="manager-form-group">
                                    <label>Giá bán (₫)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1000"
                                        value={form.sale_price}
                                        onChange={(e) => update('sale_price', e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Tồn kho</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.stock_qty}
                                        onChange={(e) => update('stock_qty', e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="manager-form-group">
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
                            <div className="manager-form-actions">
                                <button
                                    type="button"
                                    className="manager-btn-secondary"
                                    onClick={() => navigate('/manager/products')}
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="manager-btn-primary"
                                    disabled={loading}
                                >
                                    {loading ? 'Đang lưu...' : 'Tạo sản phẩm'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
