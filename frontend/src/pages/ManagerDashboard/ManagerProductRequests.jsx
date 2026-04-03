import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getProductRequests, approveProductRequest, rejectProductRequest } from '../../services/productsApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const LIMIT = 10;

export default function ManagerProductRequests() {
    const navigate = useNavigate();
    const [requests, setRequests] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [order, setOrder] = useState('desc');
    const [successMessage, setSuccessMessage] = useState('');
    const [processingId, setProcessingId] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ show: false, action: null, id: null, title: '', message: '' });

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getProductRequests(page, LIMIT, search, statusFilter, { sortBy, order });
            setRequests(data.productRequests || []);
            setTotal(data.total ?? 0);
            setTotalPages(data.totalPages ?? 1);
        } catch (e) {
            setError(e.message || 'Lỗi tải danh sách yêu cầu');
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter, sortBy, order]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setSearch(searchInput.trim());
        setPage(1);
    };

    const handleFilterChange = (e) => {
        setStatusFilter(e.target.value);
        setPage(1);
    };

    const toggleSort = (field) => {
        if (sortBy === field) {
            setOrder(order === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setOrder('desc');
        }
        setPage(1);
    };

    const renderSortIcon = (field) => {
        if (sortBy !== field) return <i className="fa-solid fa-sort" style={{ marginLeft: 8, opacity: 0.3 }} />;
        return order === 'asc' 
            ? <i className="fa-solid fa-sort-up" style={{ marginLeft: 8, color: '#2563eb' }} />
            : <i className="fa-solid fa-sort-down" style={{ marginLeft: 8, color: '#2563eb' }} />;
    };

    const openConfirm = (action, id, title, message) => {
        setConfirmModal({ show: true, action, id, title, message });
    };

    const handleConfirmClose = () => {
        setConfirmModal({ show: false, action: null, id: null, title: '', message: '' });
    };

    const handleConfirmSubmit = async () => {
        const { action, id } = confirmModal;
        handleConfirmClose();

        if (action === 'approve') {
            setProcessingId(id);
            setError('');
            setSuccessMessage('');
            try {
                await approveProductRequest(id);
                setSuccessMessage('Đã duyệt yêu cầu tạo sản phẩm thành công.');
                fetchList();
            } catch (err) {
                setError(err.message || 'Lỗi khi duyệt yêu cầu');
            } finally {
                setProcessingId(null);
            }
        } else if (action === 'reject') {
            setProcessingId(id);
            setError('');
            setSuccessMessage('');
            try {
                await rejectProductRequest(id);
                setSuccessMessage('Đã từ chối yêu cầu tạo sản phẩm.');
                fetchList();
            } catch (err) {
                setError(err.message || 'Lỗi khi từ chối yêu cầu');
            } finally {
                setProcessingId(null);
            }
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
                    <div className="manager-topbar-search-wrap">
                        {/* Search moved to main content area */}
                    </div>
                    <div className="manager-topbar-actions">
                        <div className="manager-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản lý</span>
                        </div>
                    </div>
                </header>

                <div className="manager-content">
                    <div className="manager-products-header">
                        <div>
                            <h1 className="manager-page-title">Yêu cầu tạo sản phẩm mới</h1>
                            <p className="manager-page-subtitle">Quản lý các sản phẩm mới được đề xuất bởi kho</p>
                        </div>
                    </div>

                    <div style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 20 }}>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, maxWidth: 350 }}>
                                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Tìm kiếm</label>
                                <form onSubmit={handleSearchSubmit} style={{ position: 'relative', margin: 0 }}>
                                    <i className="fa-solid fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}></i>
                                    <input
                                        type="search"
                                        placeholder="Tìm theo tên, SKU..."
                                        style={{ width: '100%', padding: '8px 12px 8px 36px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box', outline: 'none' }}
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                    />
                                </form>
                            </div>

                            <div style={{ width: 200 }}>
                                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Trạng thái</label>
                                <select
                                    className="manager-select"
                                    value={statusFilter}
                                    onChange={handleFilterChange}
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, height: 38 }}
                                >
                                    <option value="">Tất cả</option>
                                    <option value="pending">Chờ duyệt</option>
                                    <option value="approved">Đã duyệt</option>
                                    <option value="rejected">Đã từ chối</option>
                                </select>
                            </div>

                            <div style={{ width: 220 }}>
                                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Sắp xếp giá trị</label>
                                <button
                                    type="button"
                                    onClick={() => { 
                                        if (sortBy === 'created_at') {
                                            setSortBy('cost_price');
                                            setOrder('desc');
                                        } else if (sortBy === 'cost_price' && order === 'desc') {
                                            setSortBy('cost_price');
                                            setOrder('asc');
                                        } else {
                                            setSortBy('created_at');
                                            setOrder('desc');
                                        }
                                        setPage(1); 
                                    }}
                                    style={{
                                        width: '100%',
                                        height: 38,
                                        padding: '0 12px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: 6,
                                        backgroundColor: 'white',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: 14,
                                        color: '#374151'
                                    }}
                                >
                                    <span>
                                        {sortBy === 'created_at' ? 'Mặc định (Mới nhất)' : 
                                         (order === 'desc' ? 'Giá vốn (Cao nhất)' : 'Giá vốn (Thấp nhất)')}
                                    </span>
                                    <i className={`fa-solid ${sortBy === 'created_at' ? 'fa-calendar-days' : (order === 'desc' ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-wide-short')}`} style={{ color: '#6b7280' }} />
                                </button>
                            </div>
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
                                                <th>SKU</th>
                                                <th>Tên sản phẩm</th>
                                                <th>Giá vốn</th>
                                                <th>Giá bán</th>
                                                <th>Người gửi</th>
                                                <th>Ngày gửi</th>
                                                <th>Ghi chú</th>
                                                <th>Trạng thái</th>
                                                <th>Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {requests.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="manager-products-empty">
                                                        {search ? 'Không có yêu cầu nào phù hợp.' : 'Chưa có yêu cầu tạo sản phẩm nào.'}
                                                    </td>
                                                </tr>
                                            ) : (
                                                requests.map((r) => (
                                                    <tr key={r._id}>
                                                        <td>{r.sku || '—'}</td>
                                                        <td><strong>{r.name || '—'}</strong></td>
                                                        <td>{formatMoney(r.cost_price)}</td>
                                                        <td>{formatMoney(r.sale_price)}</td>
                                                        <td>
                                                            <strong>{r.requested_by?.fullName || '—'}</strong>
                                                        </td>
                                                        <td>
                                                            {new Date(r.created_at).toLocaleDateString('vi-VN')}
                                                        </td>
                                                        <td style={{ maxWidth: 150 }}>
                                                            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', fontSize: 12, color: '#4b5563' }}>
                                                                {r.note || ''}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className={`manager-products-status manager-products-status--${r.status || 'pending'}`}>
                                                                {r.status === 'pending' ? 'Chờ duyệt' : r.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="manager-products-actions">
                                                                {r.status === 'pending' && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            className="manager-btn-icon"
                                                                            style={{ color: '#059669', borderColor: '#a7f3d0' }}
                                                                            title="Duyệt"
                                                                            onClick={() => openConfirm('approve', r._id, 'Xác nhận duyệt', 'Bạn có chắc chắn muốn duyệt yêu cầu này? Sản phẩm sẽ được tạo trong hệ thống.')}
                                                                            disabled={processingId === r._id}
                                                                        >
                                                                            <i className="fa-solid fa-check" />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="manager-btn-icon"
                                                                            style={{ color: '#dc2626', borderColor: '#fecaca' }}
                                                                            title="Từ chối"
                                                                            onClick={() => openConfirm('reject', r._id, 'Từ chối yêu cầu', 'Bạn có chắc chắn muốn từ chối yêu cầu tạo sản phẩm này?')}
                                                                            disabled={processingId === r._id}
                                                                        >
                                                                            <i className="fa-solid fa-xmark" />
                                                                        </button>
                                                                    </>
                                                                )}
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

            {confirmModal.show && (
                <div className="manager-reason-modal-overlay" onClick={handleConfirmClose}>
                    <div className="manager-reason-modal-box" onClick={(e) => e.stopPropagation()}>
                        <h3 className="manager-reason-modal-title">{confirmModal.title}</h3>
                        <p className="manager-reason-modal-hint">{confirmModal.message}</p>
                        <div className="manager-reason-modal-actions">
                            <button className="manager-btn-secondary" onClick={handleConfirmClose}>
                                Hủy
                            </button>
                            <button
                                className="manager-btn-primary"
                                style={confirmModal.action === 'reject' ? { background: '#dc2626' } : {}}
                                onClick={handleConfirmSubmit}
                            >
                                Xác nhận
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
