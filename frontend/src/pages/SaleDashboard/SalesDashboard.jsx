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
      <SalesSidebar collapsed={sidebarCollapsed} />
      <main className={`sales-main${isPosRoute ? ' pos-mode' : ''}`}>
        {!isPosRoute && (
        <header className="sales-header flex h-12 items-center gap-2 border-b border-slate-200/80 bg-gradient-to-r from-teal-50/90 via-white to-sky-50/80 px-3 shadow-sm shadow-slate-900/[0.03] backdrop-blur-sm">
          <button
            type="button"
            className="sales-toggle-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white/90 text-slate-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50/50 hover:text-teal-800"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Mở menu' : 'Thu nhỏ menu'}
          >
            <i className="fa-solid fa-bars text-sm" />
          </button>

          <div className="min-w-0 flex-1" />

          <div className="sales-user-badge flex max-w-[min(100%,420px)] items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 py-1 pl-1 pr-3 text-[11px] font-semibold text-slate-700 shadow-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-[10px] text-white shadow-inner">
              <i className="fa-solid fa-user" />
            </span>
            {storeName && (
              <span className="hidden max-w-[140px] truncate rounded-md border border-teal-200/80 bg-teal-50/90 px-2 py-0.5 text-[10px] font-bold text-teal-800 sm:inline">
                <i className="fa-solid fa-store mr-1 text-[9px]" />
                {storeName}
              </span>
            )}
            <span className="truncate">{displayName}</span>
            <span className="shrink-0 text-[10px] font-medium text-slate-400">({roleLabel})</span>
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
