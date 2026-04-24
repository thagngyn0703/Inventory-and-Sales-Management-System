import React from 'react';
import WarehouseStocktakingList from '../WarehouseDashboard/WarehouseStocktakingList';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';

export default function ManagerStocktakingListPage() {
  return (
    <ManagerPageFrame>
      <WarehouseStocktakingList />
    </ManagerPageFrame>
  );
}
