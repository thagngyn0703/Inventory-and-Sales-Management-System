import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import './ManagerDashboard.css';
import './ManagerProducts.css';

// Gọi API qua proxy (proxy trong package.json trỏ tới http://localhost:8000) để tránh 404 khi backend chạy cùng máy
const API_BASE = process.env.REACT_APP_API_URL || '/api';

const defaultForm = {
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'warehouse_staff',
};

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export default function ManagerCreateStaff() {
    const navigate = useNavigate();
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [ready, setReady] = useState(false);

    // Chỉ Manager mới được vào trang này; nếu chưa đăng nhập hoặc không phải manager thì chuyển hướng
    useEffect(() => {
        const token = localStorage.getItem('token');
        let user = null;
        try {
            const raw = localStorage.getItem('user');
            if (raw) user = JSON.parse(raw);
        } catch (_) {}
        if (!token) {
            navigate('/login', { replace: true });
            return;
        }
        if (user && user.role !== 'manager') {
            navigate('/manager', { replace: true });
            return;
        }
        if (user && !user.storeId) {
            navigate('/manager/store/register', { replace: true });
            return;
        }
        setReady(true);
    }, [navigate]);

    const update = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.fullName.trim()) {
            setError('Vui lòng nhập họ tên.');
            return;
        }
        if (!form.email.trim()) {
            setError('Vui lòng nhập email.');
            return;
        }
        if (!isEmail(form.email.trim())) {
            setError('Email không hợp lệ.');
            return;
        }
        if (form.password.length < 6) {
            setError('Mật khẩu phải >= 6 ký tự.');
            return;
        }
        if (form.password !== form.confirmPassword) {
            setError('Mật khẩu nhập lại không khớp.');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            setError('Bạn cần đăng nhập lại.');
            navigate('/login');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const res = await fetch(`${API_BASE}/auth/create-staff`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    fullName: form.fullName.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    role: form.role,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 401) {
                    setError('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
                    setLoading(false);
                    setTimeout(() => {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        navigate('/login', { replace: true });
                    }, 1500);
                    return;
                }
                if (res.status === 403) {
                    if (data.code === 'STORE_REQUIRED') {
                        setError('Bạn cần đăng ký cửa hàng trước khi tạo tài khoản nhân viên.');
                        setTimeout(() => navigate('/manager/store/register', { replace: true }), 1200);
                        setLoading(false);
                        return;
                    }
                    setError('Chỉ Manager mới có quyền tạo tài khoản nhân viên.');
                    setLoading(false);
                    return;
                }
                throw new Error(data.message || data.error || 'Tạo tài khoản thất bại');
            }

            setSuccess(data.message || 'Tạo tài khoản nhân viên thành công.');
            setForm({ ...defaultForm });
        } catch (err) {
            const msg = err.message || 'Không thể tạo tài khoản nhân viên.';
            setError(msg.includes('fetch') || msg.includes('Network') ? 'Không kết nối được máy chủ. Kiểm tra backend đã chạy tại http://localhost:8000 chưa.' : msg);
        } finally {
            setLoading(false);
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

                {ready && (
                <div className="manager-content">
                    <div className="manager-products-header">
                        <div>
                            <h1 className="manager-page-title">Tạo tài khoản nhân viên</h1>
                            <p className="manager-page-subtitle">
                                Tạo tài khoản Warehouse Staff hoặc Sales Staff cho cửa hàng. Nhân viên đăng nhập ngay bằng email và mật khẩu (không cần xác thực email).
                            </p>
                        </div>
                        <button
                            type="button"
                            className="manager-btn-secondary"
                            onClick={() => navigate('/manager')}
                        >
                            <i className="fa-solid fa-arrow-left" /> Quay lại
                        </button>
                    </div>

                    {error && <div className="manager-products-error">{error}</div>}
                    {success && (
                        <div className="manager-products-success" style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0', padding: 12, borderRadius: 10, marginBottom: 16 }}>
                            {success}
                        </div>
                    )}

                    <div className="manager-panel-card manager-product-form-card">
                        <form onSubmit={handleSubmit} className="manager-product-form">
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Họ tên <span className="required">*</span></label>
                                    <input
                                        type="text"
                                        value={form.fullName}
                                        onChange={(e) => update('fullName', e.target.value)}
                                        placeholder="Nguyễn Văn A"
                                    />
                                </div>
                                <div className="manager-form-group">
                                    <label>Email <span className="required">*</span></label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => update('email', e.target.value)}
                                        placeholder="nhanvien@example.com"
                                    />
                                </div>
                            </div>
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Mật khẩu <span className="required">*</span></label>
                                    <input
                                        type="password"
                                        value={form.password}
                                        onChange={(e) => update('password', e.target.value)}
                                        placeholder="Tối thiểu 6 ký tự"
                                        minLength={6}
                                    />
                                </div>
                                <div className="manager-form-group">
                                    <label>Nhập lại mật khẩu <span className="required">*</span></label>
                                    <input
                                        type="password"
                                        value={form.confirmPassword}
                                        onChange={(e) => update('confirmPassword', e.target.value)}
                                        placeholder="Nhập lại mật khẩu"
                                    />
                                </div>
                            </div>
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Vai trò <span className="required">*</span></label>
                                    <select
                                        value={form.role}
                                        onChange={(e) => update('role', e.target.value)}
                                    >
                                        <option value="warehouse_staff">Warehouse Staff (Nhân viên kho)</option>
                                        <option value="sales_staff">Sales Staff (Nhân viên bán hàng)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="manager-form-actions">
                                <button
                                    type="button"
                                    className="manager-btn-secondary"
                                    onClick={() => navigate('/manager')}
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="manager-btn-primary"
                                    disabled={loading}
                                >
                                    {loading ? 'Đang tạo...' : 'Tạo tài khoản nhân viên'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
                )}
            </div>
        </div>
    );
}
