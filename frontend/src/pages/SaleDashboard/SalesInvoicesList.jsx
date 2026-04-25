import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getInvoices } from '../../services/invoicesApi';
import { getReturns } from '../../services/returnsApi';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { InlineNotice } from '../../components/ui/inline-notice';
import { FileText, Loader2, Receipt, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

const LIMIT = 10;

const STATUS_LABEL = {
  confirmed: 'Đã bán',
  pending: 'Chờ thanh toán',
  cancelled: 'Đã hủy',
  returned_partial: 'Trả một phần',
  returned_full: 'Trả toàn bộ',
  debt_unpaid: 'Nợ',
};

const PAYMENT_LABEL = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  credit: 'Công nợ',
  card: 'Thẻ',
  debt: 'Ghi nợ',
};

function statusBadgeClass(status) {
  if (status === 'confirmed') return 'bg-emerald-100 text-emerald-900 border-emerald-200/80';
  if (status === 'returned_partial') return 'bg-amber-100 text-amber-900 border-amber-200/80';
  if (status === 'returned_full') return 'bg-rose-100 text-rose-900 border-rose-200/80';
  if (status === 'debt_unpaid') return 'bg-red-100 text-red-900 border-red-200/80';
  if (status === 'cancelled') return 'bg-slate-100 text-slate-700 border-slate-200/80';
  return 'bg-slate-100 text-slate-700 border-slate-200/80';
}

function getInvoiceStatusView(inv) {
  const isDebtUnpaid = inv?.payment_method === 'debt' && inv?.payment_status !== 'paid';
  if (isDebtUnpaid) return 'debt_unpaid';
  if (inv?.status === 'confirmed') return 'confirmed';
  return inv?.status || 'confirmed';
}

export default function SalesInvoicesList({ basePathOverride = null, detailPathBuilder = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const basePath = basePathOverride || (location.pathname.startsWith('/manager') ? '/manager' : '/staff');
  const isReturnsPage = location.pathname.includes('/returns');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const hasFilters = Boolean(dateFrom || dateTo || searchKey);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [invoiceResp, returnsResp] = await Promise.all([
        getInvoices({ page: 1, limit: 1000 }),
        getReturns({ page: 1, limit: 1000 }),
      ]);
      const allInvoicesRaw = invoiceResp.invoices || [];
      const allReturnsRaw = returnsResp.returns || [];
      const invoiceMap = new Map(allInvoicesRaw.map((inv) => [String(inv._id), inv]));

      const invoiceRows = allInvoicesRaw.map((inv) => ({
        type: 'sale',
        _id: String(inv._id),
        createdAt: inv.invoice_at,
        code: String(inv.display_code || inv._id),
        customerName: inv.recipient_name || 'Khách lẻ',
        sellerName: inv.seller_name || inv.created_by?.fullName || inv.created_by?.email || '—',
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
          _id: `return-${rt._id}`,
          createdAt: rt.return_at || rt.created_at,
          code: String(rt._id),
          customerName: rt.invoice_id?.recipient_name || originInvoice?.recipient_name || '—',
          sellerName: rt.created_by?.fullName || rt.created_by?.email || '—',
          status: returnStatus,
          paymentMethod: originInvoice?.payment_method ? (PAYMENT_LABEL[originInvoice.payment_method] || originInvoice.payment_method) : '—',
          amount: Number(rt.total_amount || 0),
          invoiceId: originInvoiceId || null,
          returnId: rt._id,
        };
      });

      let allInvoices = isReturnsPage
        ? returnRows
        : [...invoiceRows, ...returnRows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (dateFrom) {
        const df = new Date(dateFrom);
        df.setHours(0, 0, 0, 0);
        allInvoices = allInvoices.filter((i) => new Date(i.invoice_at) >= df);
      }
      if (dateTo) {
        const dt = new Date(dateTo);
        dt.setHours(23, 59, 59, 999);
        allInvoices = allInvoices.filter((i) => new Date(i.invoice_at) <= dt);
      }
      if (searchKey) {
        const lowerSearch = searchKey.toLowerCase().trim();
        allInvoices = allInvoices.filter(
          (i) =>
            (i.code && i.code.toLowerCase().includes(lowerSearch)) ||
            (i.customerName && i.customerName.toLowerCase().includes(lowerSearch)) ||
            (i.sellerName && i.sellerName.toLowerCase().includes(lowerSearch))
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
  }, [page, dateFrom, dateTo, searchKey, isReturnsPage]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, searchKey]);

  useEffect(() => {
    setPage(1);
  }, [isReturnsPage]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
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

  const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const end = Math.min(page * LIMIT, total);

  return (
    <StaffPageShell
      eyebrow={isReturnsPage ? 'Kho & bán hàng' : 'Bán hàng'}
      eyebrowIcon={isReturnsPage ? FileText : Receipt}
      eyebrowTone={isReturnsPage ? 'amber' : 'teal'}
      title={isReturnsPage ? 'Danh sách hàng trả lại' : 'Lịch sử bán lẻ'}
      subtitle={
        isReturnsPage
          ? 'Theo dõi các đơn đã thực hiện trả hàng.'
          : 'Theo dõi toàn bộ hóa đơn bán lẻ và trạng thái thanh toán.'
      }
    >
      <InlineNotice message={error} type="error" />

      <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
        <CardContent className="p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Từ ngày</label>
              <input
                type="date"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Đến ngày</label>
              <input
                type="date"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Tìm mã / khách hàng
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Mã đơn hoặc tên khách..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-sky-200 focus:ring-2"
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                />
              </div>
            </div>
          </div>
          {hasFilters && (
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setSearchKey('');
                }}
              >
                <X className="h-4 w-4" />
                Xóa lọc
              </Button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
            <span>
              Tổng <strong className="text-slate-900">{total}</strong> phiếu
              {total > 0 && (
                <>
                  {' '}
                  · Hiển thị <strong className="text-slate-900">{start}</strong>–
                  <strong className="text-slate-900">{end}</strong>
                </>
              )}
            </span>
            {loading && (
              <span className="inline-flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải...
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
        <CardContent className="p-0 sm:p-0">
          {loading && invoices.length === 0 ? (
            <div className="flex justify-center py-16 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="py-14 text-center text-slate-500">Không có hóa đơn nào phù hợp.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full min-w-[860px] text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Ngày tạo</th>
                      <th className="px-4 py-3">Mã đơn</th>
                      <th className="px-4 py-3">Khách hàng</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Thanh toán</th>
                      <th className="px-4 py-3 text-right">Tổng tiền</th>
                      <th className="w-24 px-4 py-3 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {invoices.map((inv) => {
                      const statusView = getInvoiceStatusView(inv);
                      const dt = formatDateParts(inv.createdAt);
                      return (
                      <tr key={inv._id} className="transition-colors odd:bg-white even:bg-slate-50/30 hover:bg-sky-50/40">
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                          <div className="font-semibold text-slate-900">{dt.date}</div>
                          {dt.time ? <div className="text-xs text-slate-500">{dt.time}</div> : null}
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-3.5 font-mono text-xs text-slate-700" title={inv.code}>{inv.code}</td>
                        <td className="max-w-[180px] truncate px-4 py-3.5 font-medium text-slate-900">
                          {inv.customerName || 'Khách lẻ'}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge className={cn('inline-flex rounded-full border px-2.5 py-0.5 font-semibold', statusBadgeClass(statusView))}>
                            {STATUS_LABEL[statusView] ?? statusView}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">
                          {inv.paymentMethod || '—'}
                        </td>
                        <td className={cn(
                          'px-4 py-3.5 text-right font-semibold tabular-nums',
                          inv.type === 'return' ? 'text-red-600' : 'text-slate-900'
                        )}>
                          {inv.type === 'return' ? '-' : ''}{Number(inv.amount || 0).toLocaleString('vi-VN')}₫
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 min-w-[72px]"
                            onClick={() => {
                              if (inv.type === 'return') {
                                if (!inv.returnId) return;
                                navigate(`${basePath}/returns/${inv.returnId}`);
                                return;
                              }
                              if (!inv.invoiceId) return;
                              const nextPath = detailPathBuilder
                                ? detailPathBuilder(inv)
                                : `${basePath}/invoices/${inv.invoiceId}`;
                              navigate(nextPath);
                            }}
                            disabled={inv.type === 'return' ? !inv.returnId : !inv.invoiceId}
                          >
                            {inv.type === 'return' ? 'Xem phiếu trả' : 'Xem'}
                          </Button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row">
                <p className="text-sm text-slate-600">
                  Trang <strong className="text-slate-900">{page}</strong> /{' '}
                  <strong className="text-slate-900">{totalPages}</strong>
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Trước
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </StaffPageShell>
  );
}
