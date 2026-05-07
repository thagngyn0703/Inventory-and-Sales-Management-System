import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Receipt } from 'lucide-react';
import { getInvoices } from '../../services/invoicesApi';
import { getReturns } from '../../services/returnsApi';
import { useToast } from '../../contexts/ToastContext';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const STATUS_LABEL = {
  sold: 'Đã bán',
  pending: 'Chờ thanh toán',
  cancelled: 'Đã hủy',
  returned_partial: 'Trả một phần',
  returned_full: 'Trả toàn bộ',
  debt_unpaid: 'Nợ',
};

function getStatusBadgeStyle(status) {
  if (status === 'sold') {
    return { color: '#065f46', background: '#d1fae5', border: '1px solid #86efac' };
  }
  if (status === 'returned_partial') {
    return { color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d' };
  }
  if (status === 'returned_full') {
    return { color: '#9f1239', background: '#ffe4e6', border: '1px solid #fda4af' };
  }
  if (status === 'pending') {
    return { color: '#92400e', background: '#fef9c3', border: '1px solid #fde68a' };
  }
  if (status === 'debt_unpaid') {
    return { color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5' };
  }
  if (status === 'cancelled') {
    return { color: '#374151', background: '#f3f4f6', border: '1px solid #d1d5db' };
  }
  return { color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0' };
}

const PAYMENT_LABEL = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  credit: 'Công nợ',
  card: 'Thẻ',
  debt: 'Ghi nợ',
};

function getInvoiceStatusView(inv) {
  const isDebtUnpaid = inv?.payment_method === 'debt' && inv?.payment_status !== 'paid';
  if (isDebtUnpaid) return 'debt_unpaid';
  if (inv?.status === 'confirmed') return 'sold';
  return inv?.status;
}

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
      const [invoiceResp, returnsResp] = await Promise.all([
        getInvoices({ page: 1, limit: 1000, status: statusFilter === 'returned_partial' || statusFilter === 'returned_full' ? undefined : statusFilter || undefined }),
        getReturns({ page: 1, limit: 1000 }),
      ]);
      const allInvoicesRaw = invoiceResp.invoices || [];
      const allReturnsRaw = returnsResp.returns || [];
      const invoiceMap = new Map(allInvoicesRaw.map((inv) => [String(inv._id), inv]));

      const invoiceRows = allInvoicesRaw.map((inv) => ({
        type: 'sale',
        createdAt: inv.invoice_at,
        code: inv.display_code || inv._id,
        sellerName: inv.seller_name || inv.created_by?.fullName || inv.created_by?.email || '—',
        sellerRole: inv.seller_role || '',
        customerName: inv.recipient_name || '—',
        status: getInvoiceStatusView(inv),
        paymentMethod: PAYMENT_LABEL[inv.payment_method] || inv.payment_method || '—',
        amount: Number(inv.total_amount || 0),
        invoiceId: inv._id,
      }));

      const returnRows = allReturnsRaw.map((rt) => {
        const originInvoiceId = String(rt?.invoice_id?._id || '');
        const originInvoice = invoiceMap.get(originInvoiceId);
        const returnedTotal = Number(originInvoice?.returned_total_amount || 0);
        const originTotal = Number(originInvoice?.total_amount || 0);
        const returnStatus = originTotal > 0 && returnedTotal >= originTotal ? 'returned_full' : 'returned_partial';
        return {
          type: 'return',
          createdAt: rt.return_at || rt.created_at,
          code: rt._id,
          sellerName: rt.created_by?.fullName || rt.created_by?.email || '—',
          sellerRole: '',
          customerName: rt.invoice_id?.recipient_name || originInvoice?.recipient_name || '—',
          status: returnStatus,
          paymentMethod: originInvoice?.payment_method ? (PAYMENT_LABEL[originInvoice.payment_method] || originInvoice.payment_method) : '—',
          amount: Number(rt.total_amount || 0),
          returnId: rt._id,
          invoiceId: originInvoiceId || null,
        };
      });

      let allInvoices = [...invoiceRows, ...returnRows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (statusFilter === 'returned_partial' || statusFilter === 'returned_full') {
        allInvoices = allInvoices.filter((r) => r.type === 'return' && r.status === statusFilter);
      } else if (statusFilter === 'sold') {
        allInvoices = allInvoices.filter((r) => r.type === 'sale' && r.status === 'sold');
      } else if (statusFilter) {
        allInvoices = allInvoices.filter((r) => r.status === statusFilter);
      }

      if (dateFrom) {
        const df = new Date(dateFrom); df.setHours(0,0,0,0);
        allInvoices = allInvoices.filter(i => new Date(i.createdAt) >= df);
      }
      if (dateTo) {
        const dt = new Date(dateTo); dt.setHours(23,59,59,999);
        allInvoices = allInvoices.filter(i => new Date(i.createdAt) <= dt);
      }
      if (searchKey) {
        const q = searchKey.toLowerCase().trim();
        allInvoices = allInvoices.filter(i =>
          (i.code && i.code.toLowerCase().includes(q)) ||
          (i.customerName && i.customerName.toLowerCase().includes(q)) ||
          (i.sellerName && i.sellerName.toLowerCase().includes(q))
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
      const headers = ["ID", "Ngày Tạo", "Người Bán", "Vai Trò", "Khách Hàng", "Phương Thức", "Tổng Tiền (VNĐ)"];
      
      const rows = todayInvoices.map(inv => [
        `"${inv.display_code || inv._id}"`,
        `"${new Date(inv.invoice_at).toLocaleString('vi-VN')}"`,
        `"${inv.seller_name || inv.created_by?.fullName || inv.created_by?.email || ''}"`,
        `"${inv.seller_role || ''}"`,
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
  const formatDateParts = (d) => {
    if (!d) return { date: '—', time: '' };
    try {
      const dt = new Date(d);
      return {
        date: dt.toLocaleDateString('vi-VN'),
        time: dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
    } catch {
      return { date: formatDate(d), time: '' };
    }
  };

  return (
    <ManagerPageFrame showNotificationBell={false}>
      <StaffPageShell
        eyebrow="Vận hành cửa hàng"
        eyebrowIcon={Receipt}
        title="Hóa đơn / Phiếu xuất"
        subtitle="Danh sách phiếu xuất / hóa đơn và trạng thái xử lý."
      >
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
                <option value="sold">Đã bán</option>
                <option value="pending">Chờ thanh toán</option>
                <option value="cancelled">Đã hủy</option>
                <option value="returned_partial">Trả một phần</option>
                <option value="returned_full">Trả toàn bộ</option>
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

          <div className="manager-panel-card manager-products-card rounded-2xl border border-slate-200/80 shadow-sm">
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
                        <th>Người bán</th>
                        <th>Khách hàng</th>
                        <th>Trạng thái</th>
                        <th>Thanh toán</th>
                        <th style={{ textAlign: 'right' }}>Tổng tiền</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => {
                        const statusView = inv.status;
                        const dt = formatDateParts(inv.createdAt);
                        return (
                        <tr key={`${inv.type}-${inv.code}`}>
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{dt.date}</div>
                            {dt.time ? <div style={{ fontSize: 12, color: '#64748b' }}>{dt.time}</div> : null}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.code}</td>
                          <td>
                            <div style={{ fontWeight: 500, color: '#1e293b' }}>
                              {inv.sellerName}
                            </div>
                            {inv.sellerRole && (
                              <div style={{ fontSize: 11, color: inv.sellerRole === 'Quản lý' ? '#0d9488' : '#64748b', fontWeight: 600 }}>
                                {inv.sellerRole}
                              </div>
                            )}
                          </td>
                          <td>{inv.customerName || '—'}</td>
                          <td>
                            <span
                              className="warehouse-status-badge"
                              style={{
                                ...getStatusBadgeStyle(statusView),
                                fontWeight: 700,
                                borderRadius: 999,
                                padding: '4px 10px',
                                fontSize: 12,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {STATUS_LABEL[statusView] || statusView || '—'}
                            </span>
                          </td>
                          <td>{inv.paymentMethod || '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: inv.type === 'return' ? '#dc2626' : '#059669' }}>
                            {inv.type === 'return' ? '-' : ''}{Number(inv.amount || 0).toLocaleString('vi-VN')}₫
                          </td>
                          <td>
                            <button
                              type="button"
                              className="manager-btn-secondary"
                              style={{ padding: '6px 12px', fontSize: 13 }}
                              onClick={() => {
                                if (inv.type === 'return' && inv.returnId) {
                                  navigate(`/manager/returns/${inv.returnId}`);
                                  return;
                                }
                                if (inv.invoiceId) {
                                  navigate(`/manager/invoices/${inv.invoiceId}/view`);
                                }
                              }}
                              disabled={inv.type === 'return' ? !inv.returnId : !inv.invoiceId}
                            >
                              {inv.type === 'return' ? 'Xem phiếu trả' : 'Xem'}
                            </button>
                          </td>
                        </tr>
                        );
                      })}
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
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
