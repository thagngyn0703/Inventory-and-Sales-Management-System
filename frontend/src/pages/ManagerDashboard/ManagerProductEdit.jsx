import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getProduct, updateProduct } from '../../services/productsApi';
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

export default function ManagerProductEdit() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(false);
    const [loadProduct, setLoadProduct] = useState(true);
    const [error, setError] = useState('');

    const saleNum = useMemo(() => Number(form.sale_price) || 0, [form.sale_price]);
    const costNum = useMemo(() => Number(form.cost_price) || 0, [form.cost_price]);
    const expectedProfit = useMemo(() => Math.max(0, saleNum - costNum), [saleNum, costNum]);

    useEffect(() => {
        if (!id) return;
        setLoadProduct(true);
        setError('');
        getProduct(id)
            .then((p) => {
                setForm({
                    name: p.name || '',
                    sku: p.sku || '',
                    barcode: p.barcode || '',
                    cost_price: p.cost_price != null ? String(p.cost_price) : '',
                    sale_price: p.sale_price != null ? String(p.sale_price) : '',
                    stock_qty: p.stock_qty != null ? String(p.stock_qty) : '',
                    reorder_level: p.reorder_level != null ? String(p.reorder_level) : '',
                    status: p.status === 'inactive' ? 'inactive' : 'active',
                });
            })
            .catch((e) => setError(e.message || 'Không tải được sản phẩm'))
            .finally(() => setLoadProduct(false));
    }, [id]);

    const update = (field, value) => {
        setForm((prev) => {
            const next = { ...prev, [field]: value };
            if (field === 'sale_price') {
                const v = Number(value) || 0;
                next.cost_price = v ? String(Math.round(v * 0.8)) : '';
            }
            return next;
        });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!id) return;
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
            await updateProduct(id, {
                name: form.name.trim(),
                sku: form.sku.trim(),
                barcode: form.barcode ? String(form.barcode).trim() : undefined,
                cost_price: costNum,
                sale_price: saleNum,
                stock_qty: Number(form.stock_qty) || 0,
                reorder_level: Number(form.reorder_level) || 0,
                status: form.status === 'inactive' ? 'inactive' : 'active',
            });
            navigate('/manager/products', { state: { success: 'Cập nhật sản phẩm thành công.' } });
        } catch (err) {
            setError(err.message || 'Không thể cập nhật sản phẩm.');
        } finally {
            setLoading(false);
        }
    };

    if (loadProduct) {
        return (
            <div className="manager-page-with-sidebar">
                <ManagerSidebar />
                <div className="manager-main">
                    <div className="manager-content">
                        <p className="manager-products-loading">Đang tải...</p>
                    </div>
                </div>
            </div>
        );
    }

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
                            <h1 className="manager-page-title">Sửa sản phẩm</h1>
                            <p className="manager-page-subtitle">Cập nhật thông tin sản phẩm. Giá vốn mặc định = 80% giá bán.</p>
                        </div>
                        <div className="manager-detail-actions">
                            <button
                                type="button"
                                className="manager-btn-secondary"
                                onClick={() => navigate(`/manager/products/${id}`)}
                            >
                                <i className="fa-solid fa-eye" /> Xem chi tiết
                            </button>
                            <button
                                type="button"
                                className="manager-btn-secondary"
                                onClick={() => navigate('/manager/products')}
                            >
                                <i className="fa-solid fa-arrow-left" /> Danh sách
                            </button>
                        </div>
                    </div>

                    {error && <div className="manager-products-error">{error}</div>}

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
                                    <label>Giá bán (₫)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1000"
                                        value={form.sale_price}
                                        onChange={(e) => update('sale_price', e.target.value)}
                                        placeholder="Nhập giá bán, giá vốn tự điền 80%"
                                    />
                                </div>
                                <div className="manager-form-group">
                                    <label>Giá vốn (₫)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1000"
                                        value={form.cost_price}
                                        onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))}
                                        placeholder="Mặc định 80% giá bán, có thể sửa"
                                    />
                                </div>
                            </div>
                            {(saleNum > 0 || costNum > 0) && (
                                <div className="manager-profit-hint">
                                    Lời dự kiến: <strong>{expectedProfit.toLocaleString('vi-VN')}₫</strong>
                                    {saleNum > 0 && costNum > 0 && (
                                        <span className="manager-profit-margin">
                                            (tỷ lệ lãi: {((expectedProfit / costNum) * 100).toFixed(1)}%)
                                        </span>
                                    )}
                                </div>
                            )}
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
                                    {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
