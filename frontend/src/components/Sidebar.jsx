import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        { label: '🏠 Dashboard', path: '/admin', platformOnly: true },
        { label: '🏬 Quản lý cửa hàng', path: '/admin/stores', platformOnly: true },
        { label: '🔐 Role & Permission', path: '/admin/rbac', platformOnly: true },
        { label: '🏠 Dashboard', path: '/home', roles: ['user', 'staff'] },
        { label: '📦 Sản phẩm', path: '/manager/products', roles: ['manager', 'staff'] },
        { label: '📂 Danh mục', path: '/manager/categories', roles: ['manager', 'staff'] },
        { label: '👥 Nhà cung cấp', path: '/suppliers', roles: ['manager'] },
        { label: '👤 Khách hàng', path: '/customers', roles: ['manager'] },
        { label: '📋 Hóa đơn / Đơn hàng', path: '/manager/invoices', roles: ['manager'] },
    ];

    const user = JSON.parse(localStorage.getItem('user'));
    const userRole = user?.role || 'user';

    const visibleItems = menuItems.filter((item) => {
        if (item.platformOnly) {
            return userRole === 'admin';
        }
        return (item.roles || []).includes(userRole);
    });

    const handleNavigation = (path) => {
        navigate(path);
    };

    const isActive = (path) => location.pathname === path;

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <h2 className="logo">📊 IMS</h2>
                <p className="user-email">{user?.email || 'User'}</p>
                <p className="user-role">{userRole}{userRole === 'admin' ? ' · Hệ thống' : ''}</p>
            </div>

            <nav className="sidebar-nav">
                {visibleItems.map((item) => (
                    <button
                        key={`${item.path}-${item.label}`}
                        className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
                        onClick={() => handleNavigation(item.path)}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <button
                    type="button"
                    className="logout-btn"
                    onClick={() => {
                        localStorage.clear();
                        navigate('/login');
                    }}
                >
                    🚪 Đăng xuất
                </button>
            </div>
        </div>
    );
}
