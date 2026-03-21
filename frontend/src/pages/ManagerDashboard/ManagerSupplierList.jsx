import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import { getSuppliers, setSupplierStatus } from '../../services/suppliersApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const LIMIT = 20;

export default function ManagerSupplierList() {
    const navigate = useNavigate();
    const location = useLocation();
    const [suppliers, setSuppliers] = useState([]);
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
            // Luôn hiển thị cả nhà cung cấp đã "ngừng" để có thể bật hoạt động lại
            const data = await getSuppliers(page, LIMIT, search, 'all');
            setSuppliers(data.suppliers || []);
            setTotal(data.total ?? 0);
            setTotalPages(data.totalPages ?? 1);
        } catch (e) {
            setError(e.message || 'Lỗi tải danh sách');
            setSuppliers([]);
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

    const handleToggleStatus = async (s) => {
        if (togglingId) return;
        const nextStatus = s.status === 'active' ? 'inactive' : 'active';
        setTogglingId(s._id);
        try {
            await setSupplierStatus(s._id, nextStatus);
            setSuccessMessage(nextStatus === 'active' ? 'Đã kích hoạt nhà cung cấp.' : 'Đã ngừng nhà cung cấp.');
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
                    <div className="manager-topbar-search-wrap" />
                    <div className="manager-topbar-actions">
                        <ManagerNotificationBell />
                        <div className="manager-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản lý</span>
                        </div>
                    </div>
                </header>

                <div className="manager-content">
                    <div className="manager-products-header">
                        <div>
                            <h1 className="manager-page-title">Nhà cung cấp</h1>
                            <p className="manager-page-subtitle">Quản lý danh sách nhà cung cấp</p>
                        </div>
                        <div className="manager-supplier-header-actions">
                            <form onSubmit={handleSearchSubmit} className="manager-supplier-search-form">
                                <input
                                    type="search"
                                    className="manager-supplier-search-input"
                                    placeholder="Tên nhà cung cấp"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                />
                                <button type="submit" className="manager-btn-secondary manager-supplier-search-btn" aria-label="Tìm kiếm">
                                    <i className="fa-solid fa-search" /> Tìm
                                </button>
                            </form>
                            <button
                                type="button"
                                className="manager-btn-primary"
                                onClick={() => navigate('/manager/suppliers/new')}
                            >
                                <i className="fa-solid fa-plus" /> Thêm nhà cung cấp
                            </button>
                        </div>
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
                                                <th>Tên nhà cung cấp</th>
                                                <th>Điện thoại</th>
                                                <th>Email</th>
                                                <th>Địa chỉ</th>
                                                <th>Công nợ</th>
                                                <th>Trạng thái</th>
                                                <th>Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {suppliers.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="manager-products-empty">
                                                        {search ? 'Không có nhà cung cấp nào phù hợp.' : 'Chưa có nhà cung cấp.'}
                                                    </td>
                                                </tr>
                                            ) : (
                                                suppliers.map((s) => (
                                                    <tr key={s._id}>
                                                        <td>{s.name || '—'}</td>
                                                        <td>{s.phone || '—'}</td>
                                                        <td>{s.email || '—'}</td>
                                                        <td>{s.address || '—'}</td>
                                                        <td>{formatMoney(s.payable_account)}</td>
                                                        <td>
                                                            <span className={`manager-products-status manager-products-status--${s.status || 'active'}`}>
                                                                {s.status === 'inactive' ? 'Ngừng' : 'Hoạt động'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="manager-products-actions">
                                                                <button
                                                                    type="button"
                                                                    className="manager-btn-icon"
                                                                    title="Cập nhật"
                                                                    onClick={() => navigate(`/manager/suppliers/${s._id}/edit`)}
                                                                >
                                                                    <i className="fa-solid fa-pen" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="manager-btn-icon"
                                                                    title="Đổi trạng thái"
                                                                    onClick={() => handleToggleStatus(s)}
                                                                    disabled={togglingId === s._id}
                                                                >
                                                                    {s.status === 'active' ? (
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
