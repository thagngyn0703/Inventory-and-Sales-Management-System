import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './ManagerSidebar.css';

export default function ManagerSidebar() {
    const navigate = useNavigate();
    const location = useLocation();

    const overviewItems = [
        { label: 'Tổng quan', path: '/manager', icon: 'fa-house' },
        { label: 'Đơn hàng', path: '/manager/orders', icon: 'fa-file-lines' },
        { label: 'Sản phẩm', path: '/manager/products', icon: 'fa-cart-shopping' },
        { label: 'Danh mục', path: '/manager/categories', icon: 'fa-list' },
        { label: 'Hóa đơn', path: '/manager/invoices', icon: 'fa-receipt' },
        { label: 'Giao dịch đến (NCC)', path: '/manager/incoming-transactions', icon: 'fa-truck-ramp-box' },
        { label: 'Nhà cung cấp', path: '/manager/suppliers', icon: 'fa-handshake' },
        { label: 'Thêm nhà cung cấp', path: '/manager/suppliers/new', icon: 'fa-plus' },
        { label: 'Khách hàng', path: '/manager/customers', icon: 'fa-users' },
        { label: 'Báo cáo', path: '/manager/reports', icon: 'fa-chart-bar' },
    ];

    const manageItems = [
        { label: 'Kho hàng', path: '/warehouse', icon: 'fa-warehouse' },
        { label: 'Kiểm kê chờ duyệt', path: '/manager/stocktakes/pending', icon: 'fa-clipboard-check' },
        { label: 'Lịch sử điều chỉnh', path: '/manager/adjustments', icon: 'fa-clock-rotate-left' },
        { label: 'Tạo tài khoản nhân viên', path: '/manager/staff/new', icon: 'fa-user-plus' },
        { label: 'Quản lý nhân viên', path: '/manager/staff/manage', icon: 'fa-users-gear' },
        { label: 'Cài đặt', path: '/manager/settings', icon: 'fa-gear' },
    ];

    const isActive = (path) => location.pathname === path || (path === '/manager' && location.pathname === '/manager');
    const isItemActive = (item) => {
        if (item.path === '/warehouse') return location.pathname === '/warehouse' || location.pathname.startsWith('/warehouse/');
        if (item.path === '/manager/adjustments') return location.pathname === '/manager/adjustments' || location.pathname.startsWith('/manager/adjustments/');
        if (item.path === '/manager/incoming-transactions') return location.pathname === '/manager/incoming-transactions';
        if (item.path === '/manager/suppliers') return location.pathname === '/manager/suppliers' || location.pathname.startsWith('/manager/suppliers/');
        if (item.path === '/manager/suppliers/new') return location.pathname === '/manager/suppliers/new';
        if (item.path === '/manager/staff/new') return location.pathname === '/manager/staff/new' || location.pathname.startsWith('/manager/staff/');
        if (item.path === '/manager/stocktakes/pending') return location.pathname === '/manager/stocktakes/pending' || location.pathname.startsWith('/manager/stocktakes/');
        return isActive(item.path);
    };

    return (
        <div className="manager-sidebar">
            <div className="manager-sidebar-header">
                <div className="manager-sidebar-logo">
                    <span className="manager-logo-icon">M</span>
                </div>
                <p className="manager-sidebar-title">Quản lý bán hàng</p>
            </div>

            <nav className="manager-sidebar-nav">
                <div className="manager-nav-section">
                    {overviewItems.map((item) => (
                        <button
                            key={item.path}
                            className={`manager-sidebar-item ${isActive(item.path) ? 'active' : ''}`}
                            onClick={() => navigate(item.path)}
                        >
                            <i className={`fa-solid ${item.icon} manager-item-icon`} />
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className="manager-nav-section">
                    <p className="manager-nav-group-label">QUẢN LÝ</p>
                    {manageItems.map((item) => (
                        <button
                            key={item.path}
                            className={`manager-sidebar-item ${isItemActive(item) ? 'active' : ''}`}
                            onClick={() => navigate(item.path)}
                        >
                            <i className={`fa-solid ${item.icon} manager-item-icon`} />
                            {item.label}
                        </button>
                    ))}
                </div>
            </nav>

            <div className="manager-sidebar-footer">
                <button
                    className="manager-logout-btn"
                    onClick={() => {
                        localStorage.clear();
                        navigate('/login');
                    }}
                >
                    Đăng xuất
                </button>
            </div>
        </div>
    );
}
