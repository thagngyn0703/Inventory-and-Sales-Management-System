import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import WarehouseSidebar from './WarehouseSidebar';
import './WarehouseDashboard.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

export default function WarehouseDashboard() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  });

  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    if (!token) return;
    fetch(`${API_BASE}/auth/me`, {
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
    <div className="warehouse-page-with-sidebar">
      <WarehouseSidebar />
      <div className="warehouse-main">
        <header className="warehouse-topbar">
          <div style={{ flex: 1 }} />
          <div className="warehouse-user-badge">
            <i className="fa-solid fa-circle-user" style={{ color: '#0891b2' }} />
            {storeName && (
              <span style={{
                fontSize: '11px', fontWeight: 700, color: '#0891b2',
                background: '#ecfeff', border: '1px solid #a5f3fc',
                borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap',
              }}>
                <i className="fa-solid fa-store" style={{ marginRight: 4, fontSize: 10 }} />
                {storeName}
              </span>
            )}
            <span>{displayName}</span>
            <span style={{ fontSize: '11px', opacity: 0.6 }}>({roleLabel})</span>
          </div>
        </header>
        <div className="warehouse-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
