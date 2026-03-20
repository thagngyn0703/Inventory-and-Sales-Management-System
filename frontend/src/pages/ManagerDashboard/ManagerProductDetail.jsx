import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import { getProduct, setProductStatus } from '../../services/productsApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

export default function ManagerProductDetail() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [toggling, setToggling] = useState(false);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        setError('');
        getProduct(id)
            .then(setProduct)
            .catch((e) => setError(e.message || 'Không tải được sản phẩm'))
            .finally(() => setLoading(false));
    }, [id]);

    const handleToggleStatus = async () => {
        if (!product || toggling) return;
        const nextStatus = product.status === 'active' ? 'inactive' : 'active';
        setToggling(true);
        try {
            const updated = await setProductStatus(product._id, nextStatus);
            setProduct(updated);
            setSuccessMessage(nextStatus === 'active' ? 'Đã kích hoạt sản phẩm.' : 'Đã ngừng bán sản phẩm.');
        } catch (err) {
            setError(err.message || 'Không thể đổi trạng thái');
        } finally {
            setToggling(false);
        }
    };

    const formatMoney = (n) => {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + '₫';
    };

    if (loading) {
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

    if (error && !product) {
        return (
            <div className="manager-page-with-sidebar">
                <ManagerSidebar />
                <div className="manager-main">
                    <div className="manager-content">
                        <div className="manager-products-error">{error}</div>
                        <button type="button" className="manager-btn-secondary" onClick={() => navigate('/manager/products')}>
                            Quay lại danh sách
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const p = product || {};
    const profit = (Number(p.sale_price) || 0) - (Number(p.cost_price) || 0);
    const costNum = Number(p.cost_price) || 0;
    const marginPct = costNum > 0 && profit >= 0 ? ((profit / costNum) * 100).toFixed(1) : '0';

    return (
        <div className="manager-page-with-sidebar">
            <ManagerSidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <div className="manager-topbar-search-wrap" />
                    <div className="manager-topbar-actions">
                        <ManagerNotificationBell />
                        <div className="manager-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản lý</span>
                        </div>
                    </div>
                </header>

                <div className="manager-content manager-product-detail-page">
                    <div className="manager-products-header">
                        <div>
                            <h1 className="manager-page-title">Chi tiết sản phẩm</h1>
                            <p className="manager-page-subtitle">{p.name || p.sku || '—'}</p>
                        </div>
                        <div className="manager-detail-actions">
                            <button
                                type="button"
                                className="manager-btn-outline"
                                onClick={() => navigate('/manager/products')}
                            >
                                <i className="fa-solid fa-arrow-left" /> Danh sách
                            </button>
                            <button
                                type="button"
                                className="manager-btn-outline"
                                onClick={() => navigate(`/manager/products/${id}/edit`)}
                            >
                                <i className="fa-solid fa-pen" /> Sửa
                            </button>
                            <button
                                type="button"
                                className={p.status === 'active' ? 'manager-btn-warning' : 'manager-btn-primary'}
                                onClick={handleToggleStatus}
                                disabled={toggling}
                            >
                                {p.status === 'active' ? (
                                    <><i className="fa-solid fa-pause" /> Ngừng bán</>
                                ) : (
                                    <><i className="fa-solid fa-play" /> Kích hoạt</>
                                )}
                            </button>
                        </div>
                    </div>

                    {successMessage && <div className="manager-products-success">{successMessage}</div>}
                    {error && <div className="manager-products-error">{error}</div>}

                    <div className="manager-detail-card">
                        <div className="manager-detail-section">
                            <h3 className="manager-detail-section-title">Thông tin cơ bản</h3>
                            <div className="manager-detail-table-wrap">
                                <table className="manager-detail-table">
                                    <tbody>
                                        <tr>
                                            <td className="manager-detail-label">SKU</td>
                                            <td className="manager-detail-value">{p.sku || '—'}</td>
                                        </tr>
                                        <tr>
                                            <td className="manager-detail-label">Tên sản phẩm</td>
                                            <td className="manager-detail-value">{p.name || '—'}</td>
                                        </tr>
                                        <tr>
                                            <td className="manager-detail-label">Barcode</td>
                                            <td className="manager-detail-value">{p.barcode || '—'}</td>
                                        </tr>
                                        <tr>
                                            <td className="manager-detail-label">Nhà cung cấp</td>
                                            <td className="manager-detail-value">
                                                {p.supplier_id
                                                    ? (typeof p.supplier_id === 'object' && p.supplier_id?.name
                                                        ? p.supplier_id.name + (p.supplier_id.phone ? ` — ${p.supplier_id.phone}` : '')
                                                        : '—')
                                                    : '—'}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="manager-detail-label">Trạng thái</td>
                                            <td className="manager-detail-value">
                                                <span className={`manager-detail-badge manager-detail-badge--${p.status || 'active'}`}>
                                                    {p.status === 'inactive' ? 'Ngừng bán' : 'Đang bán'}
                                                </span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="manager-detail-label">Hạn sử dụng</td>
                                            <td className="manager-detail-value">
                                                {p.expiry_date ? new Date(p.expiry_date).toLocaleDateString('vi-VN') : '—'}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="manager-detail-section">
                            <h3 className="manager-detail-section-title">Giá & đơn vị</h3>
                            <div className="manager-detail-table-wrap">
                                <table className="manager-detail-table">
                                    <tbody>
                                        <tr>
                                            <td className="manager-detail-label">Đơn vị tồn kho (gốc)</td>
                                            <td className="manager-detail-value">{p.base_unit || 'Cái'}</td>
                                        </tr>
                                        <tr>
                                            <td className="manager-detail-label">Giá vốn / 1 {p.base_unit || 'Cái'}</td>
                                            <td className="manager-detail-value">{formatMoney(p.cost_price)}</td>
                                        </tr>
                                        {(p.selling_units && p.selling_units.length) > 0 ? (
                                            <tr>
                                                <td className="manager-detail-label">Đơn vị bán & giá</td>
                                                <td className="manager-detail-value">
                                                    <table className="manager-detail-inner-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Đơn vị</th>
                                                                <th>Tỉ lệ</th>
                                                                <th>Giá bán</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {p.selling_units.map((u, i) => (
                                                                <tr key={i}>
                                                                    <td>{u.name}</td>
                                                                    <td>{u.ratio}</td>
                                                                    <td>{formatMoney(u.sale_price)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        ) : (
                                            <tr>
                                                <td className="manager-detail-label">Giá bán (đơn vị gốc)</td>
                                                <td className="manager-detail-value">{formatMoney(p.sale_price)}</td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td className="manager-detail-label">Lời dự kiến</td>
                                            <td className="manager-detail-value manager-detail-value--highlight">
                                                {formatMoney(profit)} ({marginPct}%)
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="manager-detail-section">
                            <h3 className="manager-detail-section-title">Tồn kho</h3>
                            <div className="manager-detail-table-wrap">
                                <table className="manager-detail-table">
                                    <tbody>
                                        <tr>
                                            <td className="manager-detail-label">Tồn hiện tại</td>
                                            <td className="manager-detail-value">
                                                {p.stock_qty != null ? p.stock_qty : 0} {p.base_unit || 'Cái'}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="manager-detail-label">Mức tồn tối thiểu</td>
                                            <td className="manager-detail-value">{p.reorder_level != null ? p.reorder_level : 0}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
