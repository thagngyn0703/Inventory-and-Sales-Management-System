import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './ManagerSidebar.css';

export default function ManagerSidebar() {
    const navigate = useNavigate();
    const location = useLocation();

    const overviewItems = [
        { label: 'Tổng quan', path: '/manager', icon: 'fa-house' },
        { label: 'Tạo nhân viên', path: '/manager/staff/new', icon: 'fa-user-plus' },
        { label: 'Đơn hàng', path: '/manager/orders', icon: 'fa-file-lines' },
        { label: 'Sản phẩm', path: '/manager/products', icon: 'fa-cart-shopping' },
        { label: 'Nhà cung cấp', path: '/manager/suppliers', icon: 'fa-truck' },
        { label: 'Khách hàng', path: '/manager/customers', icon: 'fa-users' },
        { label: 'Báo cáo', path: '/manager/reports', icon: 'fa-chart-bar' },
    ];

    const manageItems = [
        { label: 'Kho hàng', path: '/manager/warehouse', icon: 'fa-warehouse' },
        { label: 'Hóa đơn', path: '/manager/invoices', icon: 'fa-receipt' },
        { label: 'Cài đặt', path: '/manager/settings', icon: 'fa-gear' },
    ];

    const isActive = (path) => {
        if (path === '/manager' && location.pathname === '/manager') return true;
        if (path === '/manager/suppliers' && location.pathname.startsWith('/manager/suppliers')) return true;
        return location.pathname === path;
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
                            className={`manager-sidebar-item ${isActive(item.path) ? 'active' : ''}`}
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
