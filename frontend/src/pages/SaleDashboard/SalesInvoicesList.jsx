import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getInvoices } from '../../services/invoicesApi';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { FileText, Loader2, Receipt, Search } from 'lucide-react';
import { cn } from '../../lib/utils';

const LIMIT = 10;

const STATUS_LABEL = {
  confirmed: 'Đã thanh toán',
  pending: 'Chờ thanh toán',
  cancelled: 'Trả hàng',
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
  if (status === 'debt_unpaid') return 'bg-red-100 text-red-900 border-red-200/80';
  if (status === 'cancelled') return 'bg-amber-100 text-amber-900 border-amber-200/80';
  return 'bg-slate-100 text-slate-700 border-slate-200/80';
}

function getInvoiceStatusView(inv) {
  const isDebtUnpaid = inv?.payment_method === 'debt' && inv?.payment_status !== 'paid';
  return isDebtUnpaid ? 'debt_unpaid' : inv?.status;
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

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await getInvoices({
        page: 1,
        limit: 1000,
        status: isReturnsPage ? 'cancelled' : undefined,
      });
      let allInvoices = resp.invoices || [];

      if (!isReturnsPage) {
        allInvoices = allInvoices.filter((i) => i.status !== 'cancelled');
      }

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
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

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
                <table className="w-full min-w-[760px] text-sm">
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
                      return (
                      <tr key={inv._id} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(inv.invoice_at)}</td>
                        <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-slate-800">{inv._id}</td>
                        <td className="max-w-[160px] truncate px-4 py-3 font-medium text-slate-900">
                          {inv.recipient_name || 'Khách lẻ'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn('border font-medium', statusBadgeClass(statusView))}>
                            {STATUS_LABEL[statusView] ?? statusView}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {PAYMENT_LABEL[inv.payment_method] || inv.payment_method || '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                          {Number(inv.total_amount || 0).toLocaleString('vi-VN')}₫
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="default"
                            className="h-9"
                            onClick={() => {
                              const nextPath = detailPathBuilder
                                ? detailPathBuilder(inv)
                                : `${basePath}/${inv._id}`;
                              navigate(nextPath);
                            }}
                          >
                            Xem
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
