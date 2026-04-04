import React, { useEffect, useState } from 'react';
import ManagerNotificationBell from '../ManagerNotificationBell';
import { cn } from '../../lib/utils';

/**
 * Thanh trên manager — cùng gradient teal/sky với staff dashboard & POS.
 */
export function ManagerTopBar({ left = null, showNotificationBell = true, className }) {
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

  const storeName = (currentUser?.storeName || '').trim();
  const displayName = currentUser?.fullName || currentUser?.email || 'Quản lý';

  return (
    <header
      className={cn(
        /* class riêng — tránh .manager-topbar trong ManagerDashboard.css (nền trắng) ghi đè gradient */
        'manager-shell-topbar flex h-12 shrink-0 items-center gap-3 border-b border-teal-900/25 bg-[linear-gradient(120deg,#0d9488_0%,#0ea5e9_48%,#0284c7_100%)] px-3 shadow-md shadow-teal-900/15 sm:px-4',
        className
      )}
    >
      <div className="min-w-0 flex-1">{left}</div>
      <div className="flex shrink-0 items-center gap-2">
        {showNotificationBell ? <ManagerNotificationBell variant="onDark" /> : null}
        <div className="flex max-w-[min(100vw-8rem,360px)] items-center gap-1.5 rounded-full border border-white/30 bg-white/15 py-1 pl-1 pr-2 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm sm:gap-2 sm:pr-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/35">
            <i className="fa-solid fa-circle-user text-sm" aria-hidden />
          </span>
          {storeName ? (
            <span className="hidden max-w-[120px] truncate rounded-md border border-white/35 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white sm:inline">
              <i className="fa-solid fa-store mr-1 text-[9px] opacity-90" aria-hidden />
              {storeName}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{displayName}</span>
          <span className="hidden shrink-0 text-[10px] font-medium text-white/75 sm:inline">(Quản lý)</span>
        </div>
      </div>
    </header>
  );
}
