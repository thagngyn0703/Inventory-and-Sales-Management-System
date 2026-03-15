import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function WarehouseHome() {
  const navigate = useNavigate();

  return (
    <>
      <h1 className="warehouse-page-title">Tổng quan kho hàng</h1>
      <p className="warehouse-page-subtitle">Chức năng kiểm kê và điều chỉnh tồn kho.</p>

      <div className="warehouse-card" style={{ maxWidth: 480 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>Kiểm kê</h2>
        <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#6b7280' }}>
          Tạo phiếu kiểm kê để so sánh tồn kho thực tế với tồn hệ thống và khai báo lý do chênh lệch.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="warehouse-btn warehouse-btn-primary"
            onClick={() => navigate('/warehouse/stocktakes/new')}
          >
            Tạo phiếu kiểm kê
          </button>
          <button
            type="button"
            className="warehouse-btn warehouse-btn-secondary"
            onClick={() => navigate('/warehouse/stocktakes')}
          >
            Danh sách phiếu kiểm kê
          </button>
        </div>
      </div>
    </>
  );
}
