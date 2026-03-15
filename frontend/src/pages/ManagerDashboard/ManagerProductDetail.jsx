import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
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
                            <h1 className="manager-page-title">Chi tiết sản phẩm</h1>
                            <p className="manager-page-subtitle">{p.name || p.sku || '—'}</p>
                        </div>
                        <div className="manager-detail-actions">
                            <button
                                type="button"
                                className="manager-btn-secondary"
                                onClick={() => navigate('/manager/products')}
                            >
                                <i className="fa-solid fa-arrow-left" /> Danh sách
                            </button>
                            <button
                                type="button"
                                className="manager-btn-secondary"
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

                    <div className="manager-panel-card manager-product-detail-card">
                        <dl className="manager-detail-list">
                            <div className="manager-detail-row">
                                <dt>SKU</dt>
                                <dd>{p.sku || '—'}</dd>
                            </div>
                            <div className="manager-detail-row">
                                <dt>Tên sản phẩm</dt>
                                <dd>{p.name || '—'}</dd>
                            </div>
                            <div className="manager-detail-row">
                                <dt>Barcode</dt>
                                <dd>{p.barcode || '—'}</dd>
                            </div>
                            <div className="manager-detail-row">
                                <dt>Đơn vị tồn kho (gốc)</dt>
                                <dd>{p.base_unit || 'Cái'}</dd>
                            </div>
                            <div className="manager-detail-row">
                                <dt>Giá vốn / 1 {p.base_unit || 'Cái'}</dt>
                                <dd>{formatMoney(p.cost_price)}</dd>
                            </div>
                            {(p.selling_units && p.selling_units.length) > 0 ? (
                                <div className="manager-detail-row manager-detail-row--full">
                                    <dt>Đơn vị bán & giá</dt>
                                    <dd>
                                        <ul className="manager-selling-units-detail">
                                            {p.selling_units.map((u, i) => (
                                                <li key={i}>
                                                    <strong>{u.name}</strong>: tỉ lệ {u.ratio} = {formatMoney(u.sale_price)}
                                                </li>
                                            ))}
                                        </ul>
                                    </dd>
                                </div>
                            ) : (
                                <div className="manager-detail-row">
                                    <dt>Giá bán (đơn vị gốc)</dt>
                                    <dd>{formatMoney(p.sale_price)}</dd>
                                </div>
                            )}
                            <div className="manager-detail-row">
                                <dt>Lời dự kiến</dt>
                                <dd>{formatMoney(profit)} ({marginPct}%)</dd>
                            </div>
                            <div className="manager-detail-row">
                                <dt>Tồn kho</dt>
                                <dd>{p.stock_qty != null ? p.stock_qty : 0} {p.base_unit || 'Cái'}</dd>
                            </div>
                            <div className="manager-detail-row">
                                <dt>Mức tồn tối thiểu</dt>
                                <dd>{p.reorder_level != null ? p.reorder_level : 0}</dd>
                            </div>
                            <div className="manager-detail-row">
                                <dt>Trạng thái</dt>
                                <dd>
                                    <span className={`manager-products-status manager-products-status--${p.status || 'active'}`}>
                                        {p.status === 'inactive' ? 'Ngừng bán' : 'Đang bán'}
                                    </span>
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </div>
        </div>
    );
}
