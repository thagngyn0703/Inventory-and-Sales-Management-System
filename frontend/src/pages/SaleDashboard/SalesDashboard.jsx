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
  // Chỉ màn quầy tạo HĐ fullscreen; /staff/invoices (lịch sử) vẫn cần navbar
  const normalizedPath = location.pathname.replace(/\/$/, '') || '/';
  const isPosRoute = normalizedPath === '/staff/invoices/new';

  return (
    <div className={`sales-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}${isPosRoute ? ' pos-mode' : ''}`}>
      <SalesSidebar collapsed={sidebarCollapsed} />
      <main className={`sales-main${isPosRoute ? ' pos-mode' : ''}`}>
        {!isPosRoute && (
        <header className="sales-header flex min-h-12 flex-wrap items-center gap-2 border-b border-teal-900/20 bg-[linear-gradient(120deg,#0d9488_0%,#0ea5e9_48%,#0284c7_100%)] px-3 py-2 shadow-md shadow-teal-900/15">
          <button
            type="button"
            className="sales-toggle-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/35 bg-white/15 text-white shadow-sm transition hover:bg-white/25"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Mở menu' : 'Thu nhỏ menu'}
          >
            <i className="fa-solid fa-bars text-sm" />
          </button>

          <div className="min-w-0 flex-1" />

          <div className="sales-user-badge flex max-w-none flex-wrap items-center justify-end gap-x-2 gap-y-1 rounded-full border border-white/30 bg-white/15 py-1.5 pl-1.5 pr-3 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/25 text-[10px] text-white shadow-inner ring-1 ring-white/40">
              <i className="fa-solid fa-user" />
            </span>
            {storeName && (
              <span className="hidden rounded-md border border-white/35 bg-white/15 px-2.5 py-1 text-left text-[11px] font-bold leading-snug text-white whitespace-normal break-words sm:inline">
                <i className="fa-solid fa-store mr-1 text-[9px] opacity-90" />
                {storeName}
              </span>
            )}
            <span className="whitespace-normal break-words text-right text-white">{displayName}</span>
            <span className="shrink-0 whitespace-nowrap text-[10px] font-medium text-white/80">({roleLabel})</span>
          </div>
        </header>
        )}

        <div className={`sales-content${isPosRoute ? ' pos-mode' : ''}`}>
          <Outlet
            context={{
              sidebarCollapsed,
              toggleSidebar,
              storeName,
              staffDisplayName: displayName,
              staffRoleLabel: roleLabel,
            }}
          />
        </div>
      </main>
    </div>
  );
}
