import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const roleLabel = (role) => {
    if (role === 'staff') return 'Staff';
    if (role === 'warehouse_staff') return 'Staff (cũ: kho)';
    if (role === 'sales_staff') return 'Staff (cũ: bán hàng)';
    return role || '-';
};

export default function ManagerStaffManage() {
    const navigate = useNavigate();
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [savingId, setSavingId] = useState('');

    const fetchStaff = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login', { replace: true });
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/auth/staff/my-store`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || 'Không tải được danh sách nhân viên');
            }
            setStaff(Array.isArray(data.staff) ? data.staff : []);
        } catch (err) {
            setError(err.message || 'Không tải được danh sách nhân viên');
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        fetchStaff();
    }, [fetchStaff]);

    const removeFromStore = async (userId) => {
        const ok = window.confirm('Gỡ nhân viên này khỏi cửa hàng? Tài khoản vẫn được giữ trong hệ thống.');
        if (!ok) return;

        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login', { replace: true });
            return;
        }
        setSavingId(userId);
        setError('');
        setSuccess('');
        try {
            const res = await fetch(`${API_BASE}/auth/staff/${userId}/remove-from-store`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || 'Không thể gỡ nhân viên khỏi cửa hàng');
            }
            setStaff((prev) => prev.filter((u) => u._id !== userId));
            setSuccess('Đã gỡ nhân viên khỏi cửa hàng.');
        } catch (err) {
            setError(err.message || 'Không thể gỡ nhân viên khỏi cửa hàng');
        } finally {
            setSavingId('');
        }
    };

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
                            <h1 className="manager-page-title">Quản lý tài khoản nhân viên</h1>
                            <p className="manager-page-subtitle">
                                Nhân viên dùng một vai trò Staff (kho và bán hàng). Bạn có thể gỡ nhân viên khỏi cửa hàng khi cần.
                            </p>
                        </div>
                        <button type="button" className="manager-btn-primary" onClick={() => navigate('/manager/staff/new')}>
                            <i className="fa-solid fa-user-plus" /> Tạo tài khoản nhân viên
                        </button>
                    </div>

                    {error ? <div className="manager-products-error">{error}</div> : null}
                    {success ? <div className="manager-products-success">{success}</div> : null}

                    <div className="manager-panel-card manager-products-card">
                        {loading ? (
                            <p className="manager-products-loading">Đang tải...</p>
                        ) : (
                            <div className="manager-products-table-wrap">
                                <table className="manager-products-table">
                                    <thead>
                                        <tr>
                                            <th>Họ tên</th>
                                            <th>Email</th>
                                            <th>Vai trò</th>
                                            <th>Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {staff.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="manager-products-empty">
                                                    Chưa có nhân viên nào trong cửa hàng
                                                </td>
                                            </tr>
                                        ) : (
                                            staff.map((u) => (
                                                <tr key={u._id}>
                                                    <td>{u.fullName}</td>
                                                    <td>{u.email}</td>
                                                    <td>{roleLabel(u.role)}</td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="manager-btn-warning manager-btn-small"
                                                            onClick={() => removeFromStore(u._id)}
                                                            disabled={savingId === u._id}
                                                        >
                                                            Gỡ khỏi cửa hàng
                                                        </button>
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
