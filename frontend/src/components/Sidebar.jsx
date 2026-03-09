import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        { label: '🏠 Dashboard', path: '/admin', roles: ['admin'] },
        { label: '🏠 Tổng quan', path: '/manager', roles: ['manager'] },
        { label: '🏠 Home', path: '/home', roles: ['warehouse_staff', 'sales_staff'] },
        { label: '🗂 Danh mục', path: '/categories', roles: ['admin', 'manager', 'warehouse_staff'] },
        { label: '📦 Sản phẩm', path: '/products', roles: ['admin', 'manager', 'warehouse_staff'] },
        { label: '👥 Nhà cung cấp', path: '/suppliers', roles: ['admin', 'manager'] },
        { label: '👤 Khách hàng', path: '/customers', roles: ['admin', 'manager', 'sales_staff'] },
        { label: '📋 Đơn hàng', path: '/orders', roles: ['admin', 'manager', 'sales_staff'] },
    ];

    const user = JSON.parse(localStorage.getItem('user'));
    const userRole = user?.role || '';

    // Filter menu items based on user role
    const visibleItems = menuItems.filter(item => item.roles.includes(userRole));

    // Get dashboard path based on role
    const getDashboardPath = () => {
        if (userRole === 'admin') return '/admin';
        if (userRole === 'manager') return '/manager';
        return '/home';
    };

    const handleNavigation = (path) => {
        navigate(path);
    };

    const isActive = (path) => location.pathname === path;

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <h2 className="logo">📊 IMS</h2>
                <p className="user-email">{user?.email || 'User'}</p>
                <p className="user-role">{userRole}</p>
            </div>

            <nav className="sidebar-nav">
                {visibleItems.map((item) => (
                    <button
                        key={item.path}
                        className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
                        onClick={() => handleNavigation(item.path)}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <button
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
