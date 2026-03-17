import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getInvoices, updateInvoice } from '../../services/invoicesApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

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

export default function ManagerInvoicesList() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await getInvoices({ page, limit: 10, status: statusFilter || undefined });
      setInvoices(resp.invoices || []);
      setTotalPages(resp.totalPages || 1);
    } catch (e) {
      setError(e.message || 'Không thể tải danh sách hóa đơn');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  // Reset page to 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id);
    try {
      await updateInvoice(id, { status: newStatus });
      // Update local state instantly rather than re-fetching to save time
      setInvoices(prev => prev.map(inv => inv._id === id ? { ...inv, status: newStatus } : inv));
    } catch (e) {
      setError(e.message || 'Không thể cập nhật trạng thái hóa đơn');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-search-wrap">
            <input
              type="search"
              className="manager-search"
              placeholder="Bộ lọc trạng thái..."
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </div>
          <div className="manager-topbar-actions">
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" />
              <span>Quản lý</span>
            </div>
          </div>
        </header>

        <div className="manager-content">
          <div className="manager-products-header">
            <div>
              <h1 className="manager-page-title">Hóa đơn / Phiếu xuất</h1>
              <p className="manager-page-subtitle">Danh sách phiếu xuất / hóa đơn và trạng thái xử lý</p>
            </div>
            <button
              type="button"
              className="manager-btn-primary"
              onClick={() => navigate('/manager/invoices/new')}
            >
              <i className="fa-solid fa-plus" /> Tạo phiếu mới
            </button>
          </div>

          {error && <div className="manager-products-error">{error}</div>}

          <div className="manager-panel-card manager-products-card">
            {loading ? (
              <p className="manager-products-loading">Đang tải...</p>
            ) : (
              <div className="manager-products-table-wrap">
                <table className="manager-products-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Ngày</th>
                      <th>Người tạo</th>
                      <th>Người nhận</th>
                      <th>Trạng thái</th>
                      <th>Thanh toán</th>
                      <th>Tổng</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="manager-products-empty">
                          Không có hóa đơn nào.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((inv) => (
                        <tr key={inv._id}>
                          <td>{inv._id}</td>
                          <td>{new Date(inv.invoice_at).toLocaleString('vi-VN')}</td>
                          <td>{inv.created_by?.email ?? '—'}</td>
                          <td>{inv.recipient_name || '—'}</td>
                          <td>
                            <select
                              value={inv.status}
                              disabled={updatingId === inv._id}
                              onChange={(e) => handleStatusChange(inv._id, e.target.value)}
                              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db',
                                backgroundColor: inv.status === 'confirmed' ? '#dcfce7' :
                                                 inv.status === 'cancelled' ? '#fee2e2' :
                                                 inv.status === 'submitted' ? '#fef08a' :
                                                 '#f3f4f6'
                              }}
                            >
                              <option value="draft">Nháp</option>
                              <option value="submitted">Đã gửi</option>
                              <option value="confirmed">Đã duyệt</option>
                              <option value="paid">Đã thanh toán</option>
                              <option value="cancelled">Đã hủy</option>
                            </select>
                          </td>
                          <td>{PAYMENT_LABEL[inv.payment_method] || inv.payment_method || '—'}</td>
                          <td>{Number(inv.total_amount || 0).toLocaleString('vi-VN')}₫</td>
                          <td>
                            <button
                              type="button"
                              className="manager-btn-secondary"
                              onClick={() => navigate(`/manager/invoices/${inv._id}`)}
                            >
                              Xem
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Trang {page} / {totalPages}</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="manager-btn-secondary"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || loading}
                    >
                      Trước
                    </button>
                    <button
                      type="button"
                      className="manager-btn-secondary"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages || loading}
                    >
                      Sau
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
