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
    const [successMessage, setSuccessMessage] = useState('');
    const [processingId, setProcessingId] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ show: false, action: null, id: null, title: '', message: '' });

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getProductRequests(page, LIMIT, search, statusFilter);
            setRequests(data.productRequests || []);
            setTotal(data.total ?? 0);
            setTotalPages(data.totalPages ?? 1);
        } catch (e) {
            setError(e.message || 'Lỗi tải danh sách yêu cầu');
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter]);

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

                    <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
                        <select
                            value={statusFilter}
                            onChange={handleFilterChange}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="pending">Chờ duyệt</option>
                            <option value="approved">Đã duyệt</option>
                            <option value="rejected">Đã từ chối</option>
                        </select>
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
                                                            <div>{r.requested_by?.name || '—'}</div>
                                                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                                                                {new Date(r.created_at).toLocaleDateString('vi-VN')}
                                                            </div>
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
