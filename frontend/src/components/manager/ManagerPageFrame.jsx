import React from 'react';
import ManagerSidebar from '../../pages/ManagerDashboard/ManagerSidebar';
import { ManagerTopBar } from './ManagerTopBar';
import { useNavDrawer } from '../../hooks/useNavDrawer';

/**
 * Khung trang manager: sidebar + thanh gradient + vùng nội dung (đồng bộ staff).
 */
export default function ManagerPageFrame({ children, topBarLeft = null, showNotificationBell = true }) {
  const { isDesktop, collapsed, close, toggle } = useNavDrawer(1024);

  return (
    <div className="manager-page-with-sidebar">
      {!isDesktop && !collapsed ? (
        <button
          type="button"
          className="app-shell-nav-overlay"
          aria-label="Đóng menu điều hướng"
          onClick={close}
        />
      ) : null}

      <ManagerSidebar collapsed={collapsed} onRequestClose={close} />

      <div className="manager-main manager-main--unified">
        <ManagerTopBar
          menuButton={
            !isDesktop ? (
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/35 bg-white/15 text-white shadow-sm transition hover:bg-white/25"
                onClick={toggle}
                title={collapsed ? 'Mở menu' : 'Đóng menu'}
                aria-expanded={!collapsed}
                aria-controls="manager-sidebar-nav"
              >
                <i className="fa-solid fa-bars text-sm" aria-hidden />
              </button>
            ) : null
          }
          left={topBarLeft}
          showNotificationBell={showNotificationBell}
        />
        <div className="manager-content manager-content--unified">{children}</div>
      </div>
    </div>
  );
}
