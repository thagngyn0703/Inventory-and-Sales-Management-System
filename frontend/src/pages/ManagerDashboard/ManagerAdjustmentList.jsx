import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getAdjustments } from '../../services/adjustmentsApi';
import './ManagerDashboard.css';
import '../WarehouseDashboard/WarehouseDashboard.css';

const LIMIT = 10;

const STATUS_LABEL = { pending: 'Chờ xử lý', approved: 'Đã duyệt', rejected: 'Đã từ chối' };

export default function ManagerAdjustmentList() {
  const navigate = useNavigate();
  const [adjustments, setAdjustments] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: LIMIT };
      if (statusFilter) params.status = statusFilter;
      const data = await getAdjustments(params);
      setAdjustments(data.adjustments || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách');
      setAdjustments([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
  };

  return (
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-actions" style={{ marginLeft: 'auto' }}>
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" />
              <span>Quản lý</span>
            </div>
          </div>
        </header>
        <div className="manager-content">
          <h1 className="manager-page-title">Lịch sử điều chỉnh tồn</h1>
          <p className="manager-page-subtitle">
            Xem các phiếu điều chỉnh tồn kho đã duyệt từ kiểm kê.
          </p>

          {error && (
            <div className="warehouse-alert warehouse-alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div className="manager-panel-card">
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 14, color: '#374151' }}>
                Trạng thái:
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  style={{ marginLeft: 8, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}
                >
                  <option value="">Tất cả</option>
                  <option value="pending">Chờ xử lý</option>
                  <option value="approved">Đã duyệt</option>
                  <option value="rejected">Đã từ chối</option>
                </select>
              </label>
            </div>

            {loading ? (
              <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Đang tải...</p>
            ) : adjustments.length === 0 ? (
              <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                Chưa có phiếu điều chỉnh nào.
              </p>
            ) : (
              <>
                <div className="warehouse-table-wrap" style={{ overflowX: 'auto' }}>
                  <table className="warehouse-table manager-table">
                    <thead>
                      <tr>
                        <th>Thời gian duyệt</th>
                        <th>Người duyệt</th>
                        <th>Phiếu kiểm kê</th>
                        <th>Số dòng</th>
                        <th>Trạng thái</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjustments.map((adj) => (
                        <tr key={adj._id}>
                          <td>{formatDate(adj.approved_at || adj.created_at)}</td>
                          <td>{adj.approved_by?.email ?? '—'}</td>
                          <td>{adj.stocktake_id ? formatDate(adj.stocktake_id.snapshot_at || adj.stocktake_id.created_at) : '—'}</td>
                          <td>{Array.isArray(adj.items) ? adj.items.length : 0}</td>
                          <td>
                            <span className={`warehouse-status-badge warehouse-status-${adj.status === 'approved' ? 'completed' : adj.status === 'rejected' ? 'cancelled' : 'draft'}`}>
                              {STATUS_LABEL[adj.status] ?? adj.status}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="warehouse-btn warehouse-btn-secondary"
                              style={{ padding: '6px 12px', fontSize: 13 }}
                              onClick={() => navigate(`/manager/adjustments/${adj._id}`)}
                            >
                              Xem
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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
        </div>
      </div>
    </div>
  );
}
