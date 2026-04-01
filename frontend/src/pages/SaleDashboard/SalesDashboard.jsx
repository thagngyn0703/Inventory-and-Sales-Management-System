import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import SalesSidebar from './SalesSidebar';
import './SalesDashboard.css';

export default function SalesDashboard() {
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

  return (
    <div className={`sales-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <SalesSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
      />
      <main className="sales-main">
        <header className="sales-header">
          {/* Nút toggle sidebar */}
          <button
            className="sales-toggle-btn"
            onClick={() => setSidebarCollapsed(c => !c)}
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

        <div className="sales-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
