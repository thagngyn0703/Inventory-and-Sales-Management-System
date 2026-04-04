import React from 'react';
import ManagerSidebar from '../../pages/ManagerDashboard/ManagerSidebar';
import { ManagerTopBar } from './ManagerTopBar';

/**
 * Khung trang manager: sidebar + thanh gradient + vùng nội dung (đồng bộ staff).
 */
export default function ManagerPageFrame({ children, topBarLeft = null, showNotificationBell = true }) {
  return (
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main manager-main--unified">
        <ManagerTopBar left={topBarLeft} showNotificationBell={showNotificationBell} />
        <div className="manager-content manager-content--unified">{children}</div>
      </div>
    </div>
  );
}
