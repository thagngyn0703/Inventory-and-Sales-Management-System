import React from 'react';
import WarehouseStocktakingCreate from '../WarehouseDashboard/WarehouseStocktakingCreate';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';

export default function ManagerStocktakingCreatePage() {
  return (
    <ManagerPageFrame>
      <WarehouseStocktakingCreate />
    </ManagerPageFrame>
  );
}
