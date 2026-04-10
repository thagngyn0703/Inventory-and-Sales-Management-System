import React from 'react';
import SalesReturnPage from '../SaleDashboard/SalesReturnPage';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';

export default function ManagerReturnCreatePage() {
  return (
    <ManagerPageFrame>
      <SalesReturnPage backPathOverride="/manager/returns" />
    </ManagerPageFrame>
  );
}
