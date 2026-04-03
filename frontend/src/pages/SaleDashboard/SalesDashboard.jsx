import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SalesSidebar from './SalesSidebar';
import './SalesDashboard.css';

export default function SalesDashboard() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  });

  // Đồng bộ user mới nhất từ API (đảm bảo storeName, storeId luôn đúng)
  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    if (!token) return;
    fetch('http://localhost:8000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json().catch(() => ({})))
      .then(data => {
        if (!data?.user) return;
        setCurrentUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {});
  }, []);

  const roleLabel = currentUser?.role === 'manager' ? 'Quản lý' : 'Nhân viên';
  const storeName = currentUser?.storeName || '';
  const displayName = currentUser?.fullName || currentUser?.email || roleLabel;
  const toggleSidebar = () => setSidebarCollapsed((c) => !c);
  const isPosRoute = location.pathname.startsWith('/staff/invoices');

  return (
    <div className={`sales-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}${isPosRoute ? ' pos-mode' : ''}`}>
      <SalesSidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
      />
      <main className={`sales-main${isPosRoute ? ' pos-mode' : ''}`}>
        {!isPosRoute && (
        <header className="sales-header">
          {/* Nút toggle sidebar */}
          <button
            className="sales-toggle-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Mở menu' : 'Thu nhỏ menu'}
          >
            <i className="fa-solid fa-bars" />
          </button>

          <div style={{ flex: 1 }} />

          {/* User badge với tên cửa hàng */}
          <div className="sales-user-badge">
            <i className="fa-solid fa-circle-user" style={{ color: '#0d9488' }} />
            {storeName && (
              <span className="sales-store-tag">
                <i className="fa-solid fa-store" style={{ marginRight: 4, fontSize: 10 }} />
                {storeName}
              </span>
            )}
            <span>{displayName}</span>
            <span style={{ fontSize: '11px', opacity: 0.6 }}>({roleLabel})</span>
          </div>
        </header>
        )}

        <div className={`sales-content${isPosRoute ? ' pos-mode' : ''}`}>
          <Outlet context={{ sidebarCollapsed, toggleSidebar, storeName }} />
        </div>
      </main>
    </div>
  );
}
