import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import './AdminUserList.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const ROLE_LABELS = {
    admin: 'Quản trị hệ thống',
    manager: 'Quản lý',
    staff: 'Nhân viên',
    warehouse_staff: 'Nhân viên (cũ)',
    sales_staff: 'Nhân viên (cũ)',
};

export default function AdminUserList() {
    const [users, setUsers] = useState([]);
    const [summary, setSummary] = useState({ totalAll: 0, totalActive: 0, totalInactive: 0, totalAdmin: 0 });
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [toggling, setToggling] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ show: false, userId: null, currentStatus: '', userName: '' });
    const limit = 10;

    const token = localStorage.getItem('token');

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit, q: search });
            if (statusFilter) params.set('status', statusFilter);
            const res = await fetch(`${API}/users?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Fetch failed');
            const data = await res.json();
            setUsers(data.users || []);
            setTotal(data.total || 0);
            setTotalPages(data.totalPages || 1);
            setSummary(data.summary || {});
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    }, [page, search, statusFilter, token]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleSearch = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };

    const handleFilterChange = (val) => {
        setStatusFilter(val);
        setPage(1);
    };

    const handleClickToggle = (user) => {
        setConfirmModal({
            show: true,
            userId: user._id,
            currentStatus: user.status,
            userName: user.fullName,
        });
    };

    const confirmToggleStatus = async () => {
        const { userId, currentStatus } = confirmModal;
        setConfirmModal({ show: false, userId: null, currentStatus: '', userName: '' });

        setToggling(userId);
        const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
        try {
            const res = await fetch(`${API}/users/${userId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) {
                const data = await res.json();
                alert(data.message || 'Lỗi khi cập nhật');
                setToggling(null);
                return;
            }
            await fetchUsers();
        } catch (err) {
            console.error(err);
            alert('Lỗi kết nối');
        }
        setToggling(null);
    };

    const formatDate = (d) => {
        if (!d) return '-';
        const date = new Date(d);
        return date.toLocaleDateString('vi-VN');
    };

    const summaryCards = [
        { title: 'Tổng tài khoản', value: summary.totalAll, icon: '👥', tone: 'blue' },
        { title: 'Đang hoạt động', value: summary.totalActive, icon: '✅', tone: 'green' },
        { title: 'Đã vô hiệu hóa', value: summary.totalInactive, icon: '🚫', tone: 'red' },
        { title: 'Quản trị hệ thống', value: summary.totalAdmin, icon: '🛡️', tone: 'purple' },
    ];

    const startItem = (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, total);

    return (
        <div className="admin-page-with-sidebar">
            <Sidebar />
            <div className="admin-users-main">
                <header className="admin-users-topbar">
                    <input
                        type="search"
                        className="admin-users-search"
                        placeholder="Tìm kiếm người dùng theo tên, email..."
                        value={search}
                        onChange={handleSearch}
                    />
                    <div className="admin-users-topbar-actions">
                        <div className="admin-users-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản trị viên</span>
                        </div>
                    </div>
                </header>

                <div className="admin-users-content">
                    <div className="admin-users-page-header">
                        <h1 className="admin-users-page-title">Quản lý tài khoản</h1>
                        <p className="admin-users-page-subtitle">
                            Xem danh sách, tìm kiếm và quản lý trạng thái tài khoản người dùng
                        </p>
                    </div>

                    {/* Summary Cards */}
                    <div className="admin-users-summary-row">
                        {summaryCards.map((card, i) => (
                            <div key={i} className={`au-summary-card au-summary-card--${card.tone}`}>
                                <div className="au-summary-card__icon-wrap">
                                    <span className="au-summary-card__icon">{card.icon}</span>
                                </div>
                                <div className="au-summary-card__body">
                                    <div className="au-summary-card__title">{card.title}</div>
                                    <div className="au-summary-card__value">{card.value}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Toolbar */}
                    <div className="admin-users-toolbar">
                        <div className="admin-users-toolbar-filters">
                            {[
                                { label: 'Tất cả', value: '' },
                                { label: 'Hoạt động', value: 'active' },
                                { label: 'Vô hiệu hóa', value: 'inactive' },
                            ].map((f) => (
                                <button
                                    key={f.value}
                                    type="button"
                                    className={`au-filter-tab ${statusFilter === f.value ? 'au-filter-tab--active' : ''}`}
                                    onClick={() => handleFilterChange(f.value)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="admin-users-table-card">
                        {loading ? (
                            <div className="admin-users-loading">Đang tải...</div>
                        ) : users.length === 0 ? (
                            <div className="admin-users-empty">Không tìm thấy người dùng nào</div>
                        ) : (
                            <table className="au-table">
                                <thead>
                                    <tr>
                                        <th>HỌ TÊN</th>
                                        <th>EMAIL</th>
                                        <th>VAI TRÒ</th>
                                        <th>TRẠNG THÁI</th>
                                        <th>NGÀY TẠO</th>
                                        <th>THAO TÁC</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u._id}>
                                            <td>
                                                <div className="au-table__name">{u.fullName}</div>
                                            </td>
                                            <td>
                                                <div className="au-table__email">{u.email}</div>
                                            </td>
                                            <td>
                                                <span className={`au-role-badge au-role-badge--${u.role}`}>
                                                    {ROLE_LABELS[u.role] || u.role}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`au-status-pill au-status-pill--${u.status === 'inactive' ? 'inactive' : 'active'}`}>
                                                    {u.status === 'inactive' ? 'Vô hiệu hóa' : 'Hoạt động'}
                                                </span>
                                            </td>
                                            <td>{formatDate(u.createdAt)}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className={`au-toggle-btn ${u.status === 'inactive' ? 'au-toggle-btn--activate' : 'au-toggle-btn--deactivate'}`}
                                                    onClick={() => handleClickToggle(u)}
                                                    disabled={toggling === u._id}
                                                >
                                                    {toggling === u._id
                                                        ? '...'
                                                        : u.status === 'inactive'
                                                            ? '✓ Kích hoạt'
                                                            : '✕ Vô hiệu hóa'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {/* Pagination */}
                        {total > 0 && (
                            <div className="admin-users-pagination">
                                <div className="admin-users-pagination-text">
                                    Hiển thị <strong>{startItem}-{endItem}</strong> của <strong>{total}</strong> tài khoản
                                </div>
                                <div className="admin-users-pagination-controls">
                                    <button
                                        type="button"
                                        className="au-page-btn"
                                        disabled={page <= 1}
                                        onClick={() => setPage(page - 1)}
                                    >
                                        <i className="fas fa-chevron-left" />
                                    </button>
                                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            className={`au-page-btn ${p === page ? 'au-page-btn--active' : ''}`}
                                            onClick={() => setPage(p)}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className="au-page-btn"
                                        disabled={page >= totalPages}
                                        onClick={() => setPage(page + 1)}
                                    >
                                        <i className="fas fa-chevron-right" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Custom Modal */}
            {confirmModal.show && (
                <div className="au-modal-overlay">
                    <div className="au-modal-content">
                        <h3>Xác nhận thao tác</h3>
                        <p>
                            Bạn có chắc chắn muốn {confirmModal.currentStatus === 'inactive' ? <strong>kích hoạt</strong> : <strong style={{ color: '#dc2626' }}>vô hiệu hóa</strong>} tài khoản của <strong>{confirmModal.userName}</strong>?
                        </p>
                        <div className="au-modal-actions">
                            <button className="au-modal-btn au-modal-btn--cancel" onClick={() => setConfirmModal({ show: false, userId: null, currentStatus: '', userName: '' })}>
                                Hủy
                            </button>
                            <button className="au-modal-btn au-modal-btn--confirm" onClick={confirmToggleStatus}>
                                Xác nhận
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
