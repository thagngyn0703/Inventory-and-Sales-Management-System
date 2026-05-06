import React from 'react';
import Sidebar from '../modules/navigation/Sidebar';
import Topbar from '../modules/navigation/Topbar';
import { useNavDrawer } from '../hooks/useNavDrawer';
import './MainLayout.css';

const MainLayout = ({ children, pageTitle, pageSubtitle, searchPlaceholder }) => {
  const { isDesktop, collapsed, close, toggle } = useNavDrawer(1024);

  return (
    <div className="app-shell">
      {!isDesktop && !collapsed ? (
        <button
          type="button"
          className="app-shell-nav-overlay"
          aria-label="Đóng menu điều hướng"
          onClick={close}
        />
      ) : null}

      <Sidebar collapsed={collapsed} onRequestClose={close} />

      <div className="app-shell__main">
        <Topbar
          title={pageTitle}
          subtitle={pageSubtitle}
          searchPlaceholder={searchPlaceholder}
          menuButton={
            !isDesktop ? (
              <button
                type="button"
                className="app-shell-menu-btn"
                onClick={toggle}
                title={collapsed ? 'Mở menu' : 'Đóng menu'}
                aria-expanded={!collapsed}
                aria-controls="module-sidebar-nav"
              >
                <i className="fa-solid fa-bars" aria-hidden />
              </button>
            ) : null
          }
        />
        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;
