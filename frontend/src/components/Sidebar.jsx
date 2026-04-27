import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { logout } from '../utils/auth';
import { cn } from '../lib/utils';
import { LayoutDashboard, Store, Users, LifeBuoy, LogOut, ShieldCheck } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
        user = null;
    }
    const userRole = String(user?.role || '').toLowerCase();

    const adminItems = [
        { label: 'Tổng quan', path: '/admin', icon: LayoutDashboard },
        { label: 'Quản lý cửa hàng', path: '/admin/stores', icon: Store },
        { label: 'Quản lý tài khoản', path: '/admin/users', icon: Users },
        { label: 'Phiếu hỗ trợ', path: '/admin/support', icon: LifeBuoy },
    ];

    const resolveActivePath = (pathname) => {
        if (pathname.startsWith('/admin/support/')) return '/admin/support';
        return pathname;
    };
    const activePath = resolveActivePath(location.pathname);
    const isActive = (path) => activePath === path;

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const renderAdmin = () => (
        <aside className="admin-sidebar">
            <div className="admin-sidebar-header">
                <div className="admin-sidebar-brand-icon">
                    <ShieldCheck className="h-5 w-5" strokeWidth={2.2} aria-hidden />
                </div>
                <div className="admin-sidebar-brand-text">
                    <h2>Quản trị hệ thống</h2>
                    <p>{user?.email || 'Admin'}</p>
                </div>
            </div>
            <nav className="admin-sidebar-nav">
                {adminItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                        <button
                            key={item.path}
                            className={cn('admin-sidebar-item', active && 'active')}
                            onClick={() => navigate(item.path)}
                            type="button"
                        >
                            <Icon className="admin-sidebar-item-icon" strokeWidth={2} aria-hidden />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>
            <div className="admin-sidebar-footer">
                <button type="button" className="admin-sidebar-logout-btn" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" aria-hidden />
                    Đăng xuất
                </button>
            </div>
        </aside>
    );

    if (userRole === 'admin') return renderAdmin();
    return null;
}
