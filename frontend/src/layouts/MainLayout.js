import React from 'react';
import Sidebar from '../modules/navigation/Sidebar';
import Topbar from '../modules/navigation/Topbar';
import './MainLayout.css';

const MainLayout = ({ children, pageTitle, pageSubtitle, searchPlaceholder }) => {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <Topbar
          title={pageTitle}
          subtitle={pageSubtitle}
          searchPlaceholder={searchPlaceholder}
        />
        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;

