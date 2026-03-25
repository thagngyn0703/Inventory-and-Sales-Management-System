import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getInvoices } from '../../services/invoicesApi';
import { getCurrentUser } from '../../utils/auth';

const LIMIT = 10;

const STATUS_LABEL = {
  confirmed: 'Đã thanh toán',
  cancelled: 'Trả hàng',
};

const PAYMENT_LABEL = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  credit: 'Công nợ',
  card: 'Thẻ',
};

export default function SalesInvoicesList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const user = getCurrentUser();
  const role = user?.role || '';
  const isWarehouse = ['warehouse', 'warehouse_staff', 'manager'].includes(role);

  // Base path is now always /sales
  const basePath = '/sales';
  const isReturnsPage = location.pathname.includes('/returns');
  const [statusFilter, setStatusFilter] = useState(isReturnsPage ? 'cancelled' : 'confirmed');

  // Search Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchKey, setSearchKey] = useState('');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch up to 1000 to do client-side filtering, bypassing backend limits
      const resp = await getInvoices({
        page: 1,
        limit: 1000,
        status: statusFilter || undefined
      });
      let allInvoices = resp.invoices || [];

      if (dateFrom) {
        const df = new Date(dateFrom);
        df.setHours(0, 0, 0, 0);
        allInvoices = allInvoices.filter(i => new Date(i.invoice_at) >= df);
      }
      if (dateTo) {
        const dt = new Date(dateTo);
        dt.setHours(23, 59, 59, 999);
        allInvoices = allInvoices.filter(i => new Date(i.invoice_at) <= dt);
      }
      if (searchKey) {
        const lowerSearch = searchKey.toLowerCase().trim();
        allInvoices = allInvoices.filter(i =>
          (i._id && i._id.toLowerCase().includes(lowerSearch)) ||
          (i.recipient_name && i.recipient_name.toLowerCase().includes(lowerSearch))
        );
      }

      setTotal(allInvoices.length);
      setTotalPages(Math.ceil(allInvoices.length / LIMIT) || 1);

      const startIndex = (page - 1) * LIMIT;
      setInvoices(allInvoices.slice(startIndex, startIndex + LIMIT));

    } catch (e) {
      setError(e.message || 'Không thể tải danh sách hóa đơn');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, dateFrom, dateTo, searchKey]);

  // Reset page when search filters change
  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, searchKey]);

  // Reset page and update filter when switching between Invoices and Returns
  useEffect(() => {
    setPage(1);
    setStatusFilter(isReturnsPage ? 'cancelled' : 'confirmed');
  }, [isReturnsPage]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const formatDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('vi-VN'); } catch { return '—'; }
  };

  return (
    <>
      <h1 className="warehouse-page-title">{isReturnsPage ? 'Danh sách hàng trả lại' : 'Lịch sử bán lẻ'}</h1>
      <p className="warehouse-page-subtitle">{isReturnsPage ? 'Theo dõi các đơn hàng đã thực hiện trả hàng.' : 'Danh sách các hóa đơn bán hàng đã thực hiện.'}</p>

      {error && (
        <div className="warehouse-alert warehouse-alert-error" role="alert">
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'white', padding: 16, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Từ ngày</label>
          <input
            type="date"
            className="pos-search-input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Đến ngày</label>
          <input
            type="date"
            className="pos-search-input"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Tìm mã / khách hàng</label>
          <input
            type="text"
            placeholder="Nhập mã đơn hoặc tên khách hàng..."
            className="pos-search-input"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
          />
        </div>
      </div>

      <div className="warehouse-card">
        <div className="warehouse-card-header" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 }}>
          {/* Status filter removed as requested */}
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
                    <th>Mã đơn</th>
                    <th>Khách hàng</th>
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
                      <td>{inv._id}</td>
                      <td>{inv.recipient_name || '—'}</td>
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
                          onClick={() => navigate(`/sales/${inv._id}`)}
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
