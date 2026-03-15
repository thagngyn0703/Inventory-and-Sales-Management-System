import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInvoices } from '../../services/invoicesApi';
import { getCurrentUser } from '../../utils/auth';

const LIMIT = 10;

const STATUS_LABEL = {
  draft: 'Nháp',
  submitted: 'Đã gửi',
  confirmed: 'Đã duyệt',
  paid: 'Đã thanh toán',
  cancelled: 'Đã hủy',
};

const PAYMENT_LABEL = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  credit: 'Công nợ',
  card: 'Thẻ',
};

export default function WarehouseInvoicesList() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const user = getCurrentUser();
  const role = user?.role || '';
  const isWarehouse = ['warehouse', 'warehouse_staff'].includes(role);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await getInvoices({ page, limit: LIMIT, status: statusFilter || undefined });
      setInvoices(resp.invoices || []);
      setTotalPages(resp.totalPages || 1);
      setTotal(resp.total || 0);
    } catch (e) {
      setError(e.message || 'Không thể tải danh sách hóa đơn');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const formatDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('vi-VN'); } catch { return '—'; }
  };

  return (
    <>
      <h1 className="warehouse-page-title">Phiếu xuất / Hóa đơn</h1>
      <p className="warehouse-page-subtitle">Danh sách phiếu xuất và trạng thái xử lý.</p>

      {error && (
        <div className="warehouse-alert warehouse-alert-error" role="alert">
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {isWarehouse && (
          <button
            type="button"
            className="warehouse-btn warehouse-btn-primary"
            onClick={() => navigate('/warehouse/invoices/new')}
          >
            <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
            Tạo phiếu mới
          </button>
        )}
      </div>

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
              <option value="confirmed">Đã duyệt</option>
              <option value="paid">Đã thanh toán</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Đang tải...</p>
        ) : invoices.length === 0 ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
            Không có hóa đơn nào.
          </p>
        ) : (
          <>
            <div className="warehouse-table-wrap">
              <table className="warehouse-table">
                <thead>
                  <tr>
                    <th>Ngày tạo</th>
                    <th>Người tạo</th>
                    <th>Trạng thái</th>
                    <th>Thanh toán</th>
                    <th style={{ textAlign: 'right' }}>Tổng tiền</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv._id}>
                      <td>{formatDate(inv.invoice_at)}</td>
                      <td>{inv.created_by?.email ?? '—'}</td>
                      <td>
                        <span className={`warehouse-status-badge warehouse-status-${inv.status}`}>
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                      </td>
                      <td>{PAYMENT_LABEL[inv.payment_method] || inv.payment_method || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{Number(inv.total_amount || 0).toLocaleString('vi-VN')}₫</td>
                      <td>
                        <button
                          type="button"
                          className="warehouse-btn warehouse-btn-secondary"
                          style={{ padding: '6px 12px', fontSize: 13 }}
                          onClick={() => navigate(`/warehouse/invoices/${inv._id}`)}
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
