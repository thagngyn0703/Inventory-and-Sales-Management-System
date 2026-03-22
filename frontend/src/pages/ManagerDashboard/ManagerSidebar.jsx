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
        { label: 'Khách hàng', path: '/manager/customers', icon: 'fa-users' },
        { label: 'Báo cáo', path: '/manager/reports', icon: 'fa-chart-bar' },
    ];

    const manageItems = [
        { label: 'Kho hàng', path: '/warehouse', icon: 'fa-warehouse' },
        { label: 'Yêu cầu SP mới', path: '/manager/product-requests', icon: 'fa-box-open' },
        { label: 'Nhập kho chờ duyệt', path: '/manager/receipts', icon: 'fa-truck-loading' },
        { label: 'Kiểm kê chờ duyệt', path: '/manager/stocktakes', icon: 'fa-clipboard-check' },
        { label: 'Lịch sử điều chỉnh', path: '/manager/adjustments', icon: 'fa-history' },
        { label: 'Hóa đơn', path: '/manager/invoices', icon: 'fa-receipt' },
        { label: 'Cài đặt', path: '/manager/settings', icon: 'fa-gear' },
    ];

    const isActive = (path) => location.pathname === path || (path === '/manager' && location.pathname === '/manager');
    const isItemActive = (item) => {
        if (item.path === '/warehouse') return location.pathname === '/warehouse' || location.pathname.startsWith('/warehouse/');
        if (item.path === '/manager/stocktakes') return location.pathname === '/manager/stocktakes';
        if (item.path === '/manager/receipts') return location.pathname === '/manager/receipts' || location.pathname.startsWith('/manager/receipts/');
        if (item.path === '/manager/adjustments') return location.pathname === '/manager/adjustments' || location.pathname.startsWith('/manager/adjustments/');
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
