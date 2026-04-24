import React from 'react';
import SalesInvoicesList from '../SaleDashboard/SalesInvoicesList';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';

export default function ManagerReturnsListPage() {
  return (
    <ManagerPageFrame>
      <SalesInvoicesList
        basePathOverride="/manager"
        detailPathBuilder={(inv) => `/manager/invoices/${inv._id}/view`}
      />
    </ManagerPageFrame>
  );
}
