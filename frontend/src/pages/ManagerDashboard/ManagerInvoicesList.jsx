import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getInvoices } from '../../services/invoicesApi';
import { useToast } from '../../contexts/ToastContext';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const STATUS_LABEL = {
  confirmed: 'Đã thanh toán',
  pending: 'Chờ thanh toán',
  cancelled: 'Trả hàng',
};

const PAYMENT_LABEL = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  credit: 'Công nợ',
  card: 'Thẻ',
  debt: 'Ghi nợ',
};

export default function ManagerInvoicesList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [total, setTotal] = useState(0);

  const LIMIT = 10;

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await getInvoices({ page: 1, limit: 1000, status: statusFilter || undefined });
      let allInvoices = resp.invoices || [];

      if (dateFrom) {
        const df = new Date(dateFrom); df.setHours(0,0,0,0);
        allInvoices = allInvoices.filter(i => new Date(i.invoice_at) >= df);
      }
      if (dateTo) {
        const dt = new Date(dateTo); dt.setHours(23,59,59,999);
        allInvoices = allInvoices.filter(i => new Date(i.invoice_at) <= dt);
      }
      if (searchKey) {
        const q = searchKey.toLowerCase().trim();
        allInvoices = allInvoices.filter(i =>
          (i._id && i._id.toLowerCase().includes(q)) ||
          (i.recipient_name && i.recipient_name.toLowerCase().includes(q)) ||
          (i.created_by?.email && i.created_by.email.toLowerCase().includes(q)) ||
          (i.created_by?.fullName && i.created_by.fullName.toLowerCase().includes(q))
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

  // Reset page to 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateFrom, dateTo, searchKey]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const exportTodayIncome = async () => {
    setExporting(true);
    setError('');
    try {
      const today = new Date();
      // Format YYYY-MM-DD
      const dateString = today.toLocaleDateString('en-CA'); 
      
      const resp = await getInvoices({ 
        page: 1, 
        limit: 10000, 
        status: 'confirmed', 
        dateFrom: dateString, 
        dateTo: dateString 
      });

      const todayInvoices = resp.invoices || [];
      if (todayInvoices.length === 0) {
        toast('Không có hóa đơn thu nhập nào trong ngày hôm nay.', 'info');
        setExporting(false);
        return;
      }

      const bom = "\uFEFF";
      const headers = ["ID", "Ngày Tạo", "Người Tạo", "Khách Hàng", "Phương Thức", "Tổng Tiền (VNĐ)"];
      
      const rows = todayInvoices.map(inv => [
        `"${inv._id}"`,
        `"${new Date(inv.invoice_at).toLocaleString('vi-VN')}"`,
        `"${inv.created_by?.email || ''}"`,
        `"${inv.recipient_name || 'Khách lẻ'}"`,
        `"${PAYMENT_LABEL[inv.payment_method] || inv.payment_method || ''}"`,
        inv.total_amount || 0
      ]);

      const totalIncome = todayInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      rows.push(["", "", "", "", '"TỔNG CỘNG"', totalIncome]);

      const csvContent = bom + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Thu_Nhap_${dateString}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError(err.message || 'Lỗi khi xuất dữ liệu');
    } finally {
      setExporting(false);
    }
  };


  const formatDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('vi-VN'); } catch { return '—'; }
  };

  return (
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-search-wrap" />
          <div className="manager-topbar-actions">
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" />
              <span>Quản lý</span>
            </div>
          </div>
        </header>

        <div className="manager-content">
          <div className="manager-invoice-header">
            <div>
              <h1 className="manager-page-title">Hóa đơn / Phiếu xuất</h1>
              <p className="manager-page-subtitle">Danh sách phiếu xuất / hóa đơn và trạng thái xử lý</p>
            </div>
            {/* <button
              type="button"
              className="manager-btn-primary"
              onClick={exportTodayIncome}
              disabled={exporting}
              style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
            >
              <i className="fa-solid fa-file-excel" />
              {exporting ? 'Đang xuất...' : 'Xuất excel thu nhập hôm nay'}
            </button> */}
          </div>

          <div className="manager-filter-bar">
            <div className="manager-filter-group">
              <label className="manager-filter-label">Từ ngày</label>
              <input
                type="date"
                className="manager-filter-input manager-filter-input--date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </div>
            <div className="manager-filter-group">
              <label className="manager-filter-label">Đến ngày</label>
              <input
                type="date"
                className="manager-filter-input manager-filter-input--date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
            <div className="manager-filter-group">
              <label className="manager-filter-label">Trạng thái</label>
              <select
                className="manager-filter-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="confirmed">Đã thanh toán</option>
                <option value="pending">Chờ thanh toán</option>
                <option value="cancelled">Trả hàng</option>
              </select>
            </div>
            <div className="manager-filter-group manager-filter-group--flex">
              <label className="manager-filter-label">Tìm kiếm</label>
              <input
                type="text"
                placeholder="Mã đơn, tên khách hàng, nhân viên..."
                className="manager-filter-input"
                value={searchKey}
                onChange={e => setSearchKey(e.target.value)}
              />
            </div>
            {(dateFrom || dateTo || searchKey || statusFilter) && (
              <button
                type="button"
                className="manager-btn-danger-outline"
                onClick={() => { setDateFrom(''); setDateTo(''); setSearchKey(''); setStatusFilter(''); }}
              >
                <i className="fa-solid fa-xmark" /> Xóa lọc
              </button>
            )}
          </div>


          {error && <div className="manager-products-error">{error}</div>}

          <div className="manager-panel-card manager-products-card">
            {loading ? (
              <p className="manager-products-loading">Đang tải...</p>
            ) : invoices.length === 0 ? (
              <p className="manager-products-loading">Không có hóa đơn nào.</p>
            ) : (
              <>
                <div className="manager-products-table-wrap">
                  <table className="manager-products-table">
                    <thead>
                      <tr>
                        <th>Ngày tạo</th>
                        <th>Mã đơn</th>
                        <th>Nhân viên</th>
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
                          <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv._id}</td>
                          <td>{inv.created_by?.email ?? '—'}</td>
                          <td>{inv.recipient_name || '—'}</td>
                          <td>
                            <span className={`warehouse-status-badge warehouse-status-${inv.status}`}>
                              {STATUS_LABEL[inv.status] || inv.status || '—'}
                            </span>
                          </td>
                          <td>{PAYMENT_LABEL[inv.payment_method] || inv.payment_method || '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#059669' }}>{Number(inv.total_amount || 0).toLocaleString('vi-VN')}₫</td>
                          <td>
                            <button
                              type="button"
                              className="manager-btn-secondary"
                              style={{ padding: '6px 12px', fontSize: 13 }}
                              onClick={() => navigate(`/manager/invoices/${inv._id}`)}
                            >
                              Xem
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>Trang {page} / {totalPages} — Tổng {total} phiếu</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="manager-btn-secondary" style={{ padding: '6px 14px' }} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>Trước</button>
                    <button type="button" className="manager-btn-secondary" style={{ padding: '6px 14px' }} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>Sau</button>
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
