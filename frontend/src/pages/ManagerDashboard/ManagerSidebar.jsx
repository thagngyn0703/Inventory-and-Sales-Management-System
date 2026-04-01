import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import StoreLockedNotice from '../../components/StoreLockedNotice';
import './ManagerSidebar.css';

export default function ManagerSidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null');
        } catch {
            return null;
        }
    });
    useEffect(() => {
        const token = localStorage.getItem('token') || '';
        if (!token) return;
        fetch('http://localhost:8000/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => res.json().catch(() => ({})))
            .then((data) => {
                if (!data?.user) return;
                setCurrentUser(data.user);
                localStorage.setItem('user', JSON.stringify(data.user));
            })
            .catch(() => {});
    }, []);
    const storeTitle = currentUser?.storeName || (currentUser?.storeId ? `Store: ${String(currentUser.storeId).slice(-6)}` : 'Chưa có cửa hàng');

    const overviewItems = [
        { label: 'Tổng quan', path: '/manager', icon: 'fa-house' },
        { label: 'Đơn hàng', path: '/manager/orders', icon: 'fa-file-lines' },
        { label: 'Sản phẩm', path: '/manager/products', icon: 'fa-cart-shopping' },
        { label: 'Danh mục', path: '/manager/categories', icon: 'fa-list' },
        { label: 'Yêu cầu tạo sản phẩm', path: '/manager/product-requests', icon: 'fa-box-open' },
        { label: 'Hóa đơn', path: '/manager/invoices', icon: 'fa-receipt' },
        { label: 'Giao dịch đến (NCC)', path: '/manager/incoming-transactions', icon: 'fa-truck-ramp-box' },
        { label: 'Nhà cung cấp', path: '/manager/suppliers', icon: 'fa-handshake' },
        { label: 'Thêm nhà cung cấp', path: '/manager/suppliers/new', icon: 'fa-plus' },
        { label: 'Khách hàng', path: '/manager/customers', icon: 'fa-users' },
        { label: 'Báo cáo', path: '/manager/reports', icon: 'fa-chart-bar' },
        { label: 'Thông báo', path: '/manager/notifications', icon: 'fa-bell' },
    ];

    const manageItems = [
        { label: 'Kiểm kê chờ duyệt', path: '/manager/stocktakes/pending', icon: 'fa-clipboard-check' },
        { label: 'Phiếu nhập chờ duyệt', path: '/manager/receipts', icon: 'fa-file-invoice' },
        { label: 'Lịch sử điều chỉnh', path: '/manager/adjustments', icon: 'fa-clock-rotate-left' },
        { label: 'Tạo tài khoản nhân viên', path: '/manager/staff/new', icon: 'fa-user-plus' },
        { label: 'Quản lý nhân viên', path: '/manager/staff/manage', icon: 'fa-users-gear' },
        { label: 'Cài đặt', path: '/manager/settings', icon: 'fa-gear' },
    ];

    const getActivePath = (pathname) => {
        // Most specific routes first to ensure only one menu item is active.
        if (pathname === '/manager/suppliers/new') return '/manager/suppliers/new';
        if (pathname.startsWith('/manager/staff/manage')) return '/manager/staff/manage';
        if (pathname.startsWith('/manager/staff/new')) return '/manager/staff/new';
        if (pathname.startsWith('/manager/stocktakes/')) return '/manager/stocktakes/pending';
        if (pathname.startsWith('/manager/adjustments/')) return '/manager/adjustments';
        if (pathname.startsWith('/manager/notifications/')) return '/manager/notifications';
        if (pathname.startsWith('/manager/suppliers/')) return '/manager/suppliers';
        return pathname;
    };
    const activePath = getActivePath(location.pathname);
    const isItemActive = (itemPath) => activePath === itemPath;
    const preventSameRouteNavigation = (e, itemPath) => {
        if (location.pathname === itemPath) e.preventDefault();
    };

    return (
        <>
            <StoreLockedNotice visible={currentUser?.storeStatus === 'inactive'} />
            <div className="manager-sidebar">
                <div className="manager-sidebar-header">
                <div className="manager-sidebar-logo">
                    <span className="manager-logo-icon">M</span>
                </div>
                <p className="manager-sidebar-title">Quản lý bán hàng</p>
                <p className="manager-sidebar-store">{storeTitle}</p>
            </div>

            <nav className="manager-sidebar-nav">
                <div className="manager-nav-section">
                    {overviewItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            onClick={(e) => preventSameRouteNavigation(e, item.path)}
                            className={`manager-sidebar-item ${isItemActive(item.path) ? 'active' : ''}`}
                        >
                            <i className={`fa-solid ${item.icon} manager-item-icon`} />
                            {item.label}
                        </Link>
                    ))}
                </div>
                <div className="manager-nav-section">
                    <p className="manager-nav-group-label">QUẢN LÝ</p>
                    {manageItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            onClick={(e) => preventSameRouteNavigation(e, item.path)}
                            className={`manager-sidebar-item ${isItemActive(item.path) ? 'active' : ''}`}
                        >
                            <i className={`fa-solid ${item.icon} manager-item-icon`} />
                            {item.label}
                        </Link>
                    ))}
                </div>
            </nav>

            <div className="manager-sidebar-footer">
                <button
                    type="button"
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
        </>
    );
}
