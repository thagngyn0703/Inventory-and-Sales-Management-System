/**
 * SalesInvoiceDetail — Staff POS entry point.
 * Delegate toàn bộ logic xuống POSContainer với layoutMode='staff'.
 * Staff không sửa được giá, seller_role sẽ là 'Nhân viên'.
 */
import React from 'react';
import { useOutletContext } from 'react-router-dom';
import POSContainer from '../../components/pos/POSContainer';

export default function SalesInvoiceDetail() {
  const outletContext = useOutletContext() || {};
  const {
    toggleSidebar,
    sidebarCollapsed = false,
    storeName = 'Cửa hàng',
    staffDisplayName = '',
    staffRoleLabel = 'Nhân viên',
  } = outletContext;

  return (
    <POSContainer
      layoutMode="staff"
      storeName={storeName}
      staffDisplayName={staffDisplayName}
      staffRoleLabel={staffRoleLabel}
      sidebarCollapsed={sidebarCollapsed}
      toggleSidebar={toggleSidebar}
    />
  );
}
