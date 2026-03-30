import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getStocktakes } from '../../services/stocktakesApi';
import { useWarehouseBase } from '../../utils/useWarehouseBase';

const LIMIT = 10;

const STATUS_LABEL = {
  draft: 'Nháp',
  submitted: 'Đã gửi',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export default function WarehouseStocktakingList() {
  const navigate = useNavigate();
  const location = useLocation();
  const warehouseBase = useWarehouseBase();
  const [stocktakes, setStocktakes] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: LIMIT };
      if (statusFilter) params.status = statusFilter;
      const data = await getStocktakes(params);
      setStocktakes(data.stocktakes || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách');
      setStocktakes([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const stateMessage = location.state?.success;
    if (stateMessage) {
      setSuccessMessage(stateMessage);
      setError('');
      window.history.replaceState({}, document.title, location.pathname + location.search);
    }
  }, [location.state]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
  };

  return (
    <>
      <h1 className="warehouse-page-title">Danh sách phiếu kiểm kê</h1>
      <p className="warehouse-page-subtitle">Xem và quản lý các phiếu kiểm kê đã tạo.</p>

      {successMessage && (
        <div className="warehouse-alert warehouse-alert-success" role="status">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="warehouse-alert warehouse-alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="warehouse-card">
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14, color: '#374151' }}>
            Trạng thái:
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{
                marginLeft: 8,
                padding: '6px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              <option value="">Tất cả</option>
              <option value="draft">Nháp</option>
              <option value="submitted">Đã gửi</option>
              <option value="completed">Hoàn thành</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Đang tải...</p>
        ) : stocktakes.length === 0 ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
            Chưa có phiếu kiểm kê nào.{' '}
            <button
              type="button"
              className="warehouse-btn warehouse-btn-primary"
              style={{ marginLeft: 8 }}
              onClick={() => navigate(`${warehouseBase}/stocktakes/new`)}
            >
              Tạo phiếu kiểm kê
            </button>
          </p>
        ) : (
          <>
            <div className="warehouse-table-wrap">
              <table className="warehouse-table">
                <thead>
                  <tr>
                    <th>Thời gian tạo</th>
                    <th>Người tạo</th>
                    <th>Số dòng</th>
                    <th>Trạng thái</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stocktakes.map((st) => (
                    <tr key={st._id}>
                      <td>{formatDate(st.created_at)}</td>
                      <td>{st.created_by?.email ?? '—'}</td>
                      <td>{Array.isArray(st.items) ? st.items.length : 0}</td>
                      <td>
                        <span className={`warehouse-status-badge warehouse-status-${st.status}`}>
                          {STATUS_LABEL[st.status] ?? st.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="warehouse-btn warehouse-btn-secondary"
                          style={{ padding: '6px 12px', fontSize: 13 }}
                          onClick={() => navigate(`${warehouseBase}/stocktakes/${st._id}`)}
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                Trang {page} / {totalPages} — Tổng {total} phiếu
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="warehouse-btn warehouse-btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trước
                </button>
                <button
                  type="button"
                  className="warehouse-btn warehouse-btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
