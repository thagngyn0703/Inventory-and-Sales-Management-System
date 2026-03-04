import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getProducts, setProductStatus } from '../../services/productsApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const LIMIT = 20;

export default function ManagerProductList() {
    const navigate = useNavigate();
    const location = useLocation();
    const [products, setProducts] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [togglingId, setTogglingId] = useState(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getProducts(page, LIMIT, search);
            setProducts(data.products || []);
            setTotal(data.total ?? 0);
            setTotalPages(data.totalPages ?? 1);
        } catch (e) {
            setError(e.message || 'Lỗi tải danh sách');
            setProducts([]);
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    useEffect(() => {
        const stateMessage = location.state?.success;
        if (stateMessage) {
            setSuccessMessage(stateMessage);
            setError('');
            window.history.replaceState({}, document.title, location.pathname + location.search);
        }
    }, [location.state]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setSearch(searchInput.trim());
        setPage(1);
    };

    const handleToggleStatus = async (p) => {
        if (togglingId) return;
        const nextStatus = p.status === 'active' ? 'inactive' : 'active';
        setTogglingId(p._id);
        try {
            await setProductStatus(p._id, nextStatus);
            setSuccessMessage(nextStatus === 'active' ? 'Đã kích hoạt sản phẩm.' : 'Đã ngừng bán sản phẩm.');
            fetchList();
        } catch (err) {
            setError(err.message || 'Không thể đổi trạng thái');
        } finally {
            setTogglingId(null);
        }
    };

    const formatMoney = (n) => {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + '₫';
    };

    const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
    const end = Math.min(page * LIMIT, total);

    return (
        <div className="manager-page-with-sidebar">
            <ManagerSidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <form onSubmit={handleSearchSubmit} className="manager-topbar-search-wrap">
                        <input
                            type="search"
                            className="manager-search"
                            placeholder="Tìm kiếm theo tên, SKU, barcode..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                        />
                        <button type="submit" className="manager-icon-btn" aria-label="Tìm kiếm">
                            <i className="fa-solid fa-search" />
                        </button>
                    </form>
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
                            <h1 className="manager-page-title">Sản phẩm</h1>
                            <p className="manager-page-subtitle">Xem danh sách và tìm kiếm sản phẩm</p>
                        </div>
                        <button
                            type="button"
                            className="manager-btn-primary"
                            onClick={() => navigate('/manager/products/new')}
                        >
                            <i className="fa-solid fa-plus" /> Thêm sản phẩm
                        </button>
                    </div>

                    {successMessage && (
                        <div className="manager-products-success">{successMessage}</div>
                    )}
                    {error && <div className="manager-products-error">{error}</div>}

                    <div className="manager-panel-card manager-products-card">
                        {loading ? (
                            <p className="manager-products-loading">Đang tải...</p>
                        ) : (
                            <>
                                <div className="manager-products-table-wrap">
                                    <table className="manager-products-table">
                                        <thead>
                                            <tr>
                                                <th>SKU</th>
                                                <th>Tên sản phẩm</th>
                                                <th>Barcode</th>
                                                <th>Giá vốn</th>
                                                <th>Giá bán</th>
                                                <th>Tồn kho</th>
                                                <th>Trạng thái</th>
                                                <th>Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {products.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="manager-products-empty">
                                                        {search ? 'Không có sản phẩm nào phù hợp.' : 'Chưa có sản phẩm.'}
                                                    </td>
                                                </tr>
                                            ) : (
                                                products.map((p) => (
                                                    <tr key={p._id}>
                                                        <td>{p.sku || '—'}</td>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className="manager-product-name-link"
                                                                onClick={() => navigate(`/manager/products/${p._id}`)}
                                                            >
                                                                {p.name || '—'}
                                                            </button>
                                                        </td>
                                                        <td>{p.barcode || '—'}</td>
                                                        <td>{formatMoney(p.cost_price)}</td>
                                                        <td>{formatMoney(p.sale_price)}</td>
                                                        <td>{p.stock_qty != null ? p.stock_qty : '0'}</td>
                                                        <td>
                                                            <span className={`manager-products-status manager-products-status--${p.status || 'active'}`}>
                                                                {p.status === 'inactive' ? 'Ngừng' : 'Đang bán'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="manager-products-actions">
                                                                <button
                                                                    type="button"
                                                                    className="manager-btn-icon"
                                                                    title="Xem chi tiết"
                                                                    onClick={() => navigate(`/manager/products/${p._id}`)}
                                                                >
                                                                    <i className="fa-solid fa-eye" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="manager-btn-icon"
                                                                    title="Sửa"
                                                                    onClick={() => navigate(`/manager/products/${p._id}/edit`)}
                                                                >
                                                                    <i className="fa-solid fa-pen" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="manager-btn-icon"
                                                                    title={p.status === 'active' ? 'Ngừng bán' : 'Kích hoạt'}
                                                                    onClick={() => handleToggleStatus(p)}
                                                                    disabled={togglingId === p._id}
                                                                >
                                                                    {p.status === 'active' ? (
                                                                        <i className="fa-solid fa-pause" />
                                                                    ) : (
                                                                        <i className="fa-solid fa-play" />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                {totalPages > 1 && (
                                    <div className="manager-pagination">
                                        <span className="manager-pagination-info">
                                            Hiển thị {start}–{end} / {total}
                                        </span>
                                        <div className="manager-pagination-btns">
                                            <button
                                                type="button"
                                                className="manager-btn-secondary manager-pagination-btn"
                                                disabled={page <= 1}
                                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            >
                                                Trước
                                            </button>
                                            <span className="manager-pagination-page">
                                                Trang {page} / {totalPages}
                                            </span>
                                            <button
                                                type="button"
                                                className="manager-btn-secondary manager-pagination-btn"
                                                disabled={page >= totalPages}
                                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                            >
                                                Sau
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
