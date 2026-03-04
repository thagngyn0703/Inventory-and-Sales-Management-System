import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getProducts } from '../../services/productsApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

export default function ManagerProductList() {
    const navigate = useNavigate();
    const location = useLocation();
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const list = await getProducts(search);
            setProducts(list);
        } catch (e) {
            setError(e.message || 'Lỗi tải danh sách');
            setProducts([]);
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    // Hiển thị thông báo thành công từ state khi redirect từ trang thêm mới
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
    };

    const formatMoney = (n) => {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + '₫';
    };

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
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="manager-products-empty">
                                                    {search ? 'Không có sản phẩm nào phù hợp.' : 'Chưa có sản phẩm.'}
                                                </td>
                                            </tr>
                                        ) : (
                                            products.map((p) => (
                                                <tr key={p._id}>
                                                    <td>{p.sku || '—'}</td>
                                                    <td>{p.name || '—'}</td>
                                                    <td>{p.barcode || '—'}</td>
                                                    <td>{formatMoney(p.cost_price)}</td>
                                                    <td>{formatMoney(p.sale_price)}</td>
                                                    <td>{p.stock_qty != null ? p.stock_qty : '0'}</td>
                                                    <td>
                                                        <span className={`manager-products-status manager-products-status--${p.status || 'active'}`}>
                                                            {p.status === 'inactive' ? 'Ngừng' : 'Đang bán'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
