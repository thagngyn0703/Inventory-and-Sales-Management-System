import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { getStocktake } from '../../services/stocktakesApi';
import { InlineNotice } from '../../components/ui/inline-notice';
import { Button } from '../../components/ui/button';
import { useNavigate } from 'react-router-dom';
import ManagerStocktakeDetail from './ManagerStocktakeDetail';
import WarehouseStocktakingDetail from '../WarehouseDashboard/WarehouseStocktakingDetail';

/**
 * Phiếu nháp → màn nhập số thực tế (WarehouseStocktakingDetail).
 * Phiếu đã gửi / hoàn thành / hủy → màn xem & duyệt (ManagerStocktakeDetail).
 */
export default function ManagerStocktakePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setLoading(false);
      setLoadError('Thiếu mã phiếu kiểm kê.');
      return undefined;
    }
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const data = await getStocktake(id);
        if (!cancelled) setStatus(data?.status || null);
      } catch (e) {
        if (!cancelled) {
          setStatus(null);
          setLoadError(e.message || 'Không tải được phiếu kiểm kê');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <ManagerPageFrame showNotificationBell={false}>
        <p className="p-6 text-sm text-slate-500">Đang tải phiếu kiểm kê...</p>
      </ManagerPageFrame>
    );
  }

  if (loadError) {
    return (
      <ManagerPageFrame showNotificationBell={false}>
        <InlineNotice message={loadError} type="error" className="mb-4" />
        <Button type="button" variant="outline" onClick={() => navigate('/manager/stocktakes')}>
          Quay lại danh sách
        </Button>
      </ManagerPageFrame>
    );
  }

  if (status === 'draft') {
    return (
      <ManagerPageFrame showNotificationBell={false}>
        <WarehouseStocktakingDetail />
      </ManagerPageFrame>
    );
  }

  return <ManagerStocktakeDetail />;
}
