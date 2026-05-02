import React from 'react';
import Sidebar from '../Sidebar';

function readAdminDisplay() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user?.email || 'Quản trị viên';
  } catch {
    return 'Quản trị viên';
  }
}

export default function AdminPageFrame({ children, topBarLeft = null }) {
  const adminDisplay = readAdminDisplay();
  return (
    <div className="manager-page-with-sidebar">
      <Sidebar />
      <div className="manager-main">
        <header className="manager-shell-topbar flex h-12 shrink-0 items-center gap-3 border-b border-teal-900/25 bg-[linear-gradient(120deg,#0d9488_0%,#0ea5e9_48%,#0284c7_100%)] px-3 shadow-md shadow-teal-900/15 sm:px-4">
          <div className="min-w-0 flex-1">
            {topBarLeft || (
              <span className="inline-flex items-center rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs font-semibold text-white">
                Khu vực quản trị hệ thống
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex max-w-[min(100vw-8rem,620px)] items-center gap-1.5 rounded-full border border-white/30 bg-white/15 py-1 pl-1 pr-2 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm sm:gap-2 sm:pr-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/35">
                <i className="fa-solid fa-circle-user text-sm" aria-hidden />
              </span>
              <span className="max-w-[220px] truncate">{adminDisplay}</span>
              <span className="hidden shrink-0 text-[10px] font-medium text-white/75 sm:inline">(Admin)</span>
            </div>
          </div>
        </header>
        <div className="manager-content">{children}</div>
      </div>
    </div>
  );
}
