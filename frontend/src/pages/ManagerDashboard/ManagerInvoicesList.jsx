import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getInvoices } from '../../services/invoicesApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const STATUS_LABEL = {
  draft: 'Nháp',
  submitted: 'Đã gửi',
  confirmed: 'Đã duyệt',
  paid: 'Đã thanh toán',
  cancelled: 'Đã hủy',
};

export default function ManagerInvoicesList() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { invoices: list } = await getInvoices({ status: statusFilter || undefined });
      setInvoices(list || []);
    } catch (e) {
      setError(e.message || 'Không thể tải danh sách hóa đơn');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

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
            <button
              type="button"
              className="manager-icon-btn"
              onClick={() => navigate('/manager/invoices/new')}
            >
              <i className="fa-solid fa-plus" />
            </button>
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
                      <th>Trạng thái</th>
                      <th>Tổng</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="manager-products-empty">
                          Không có hóa đơn nào.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((inv) => (
                        <tr key={inv._id}>
                          <td>{inv._id}</td>
                          <td>{new Date(inv.invoice_at).toLocaleString('vi-VN')}</td>
                          <td>{inv.created_by?.email ?? '—'}</td>
                          <td>
                            <span className={`manager-products-status manager-products-status--${inv.status}`}>
                              {STATUS_LABEL[inv.status] ?? inv.status}
                            </span>
                          </td>
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
