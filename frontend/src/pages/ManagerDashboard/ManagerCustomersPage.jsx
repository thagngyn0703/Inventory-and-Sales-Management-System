import React from 'react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import SalesCustomerPage from '../SaleDashboard/SalesCustomerPage';

/** Khách hàng trong khung manager (sidebar + topbar gradient), tái dùng nội dung quầy bán hàng. */
export default function ManagerCustomersPage() {
  return (
    <ManagerPageFrame showNotificationBell>
      <SalesCustomerPage managerMode />
    </ManagerPageFrame>
  );
}
