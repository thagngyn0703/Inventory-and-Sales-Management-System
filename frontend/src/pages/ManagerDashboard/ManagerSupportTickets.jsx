import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LifeBuoy, Loader2 } from 'lucide-react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { createSupportTicket, listSupportTickets } from '../../services/supportTicketsApi';

const PAGE_SIZE = 8;

function statusLabel(s) {
  if (s === 'answered') return 'Đã trả lời';
  if (s === 'closed') return 'Đã đóng';
  return 'Mở';
}

function statusClassName(s) {
  if (s === 'answered') return 'border-emerald-200 bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200';
  if (s === 'closed') return 'border-slate-300 bg-slate-200 text-slate-700 ring-1 ring-slate-200';
  return 'border-sky-200 bg-sky-100 text-sky-900 ring-1 ring-sky-200';
}

export default function ManagerSupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!statusDropdownRef.current) return;
      if (!statusDropdownRef.current.contains(e.target)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listSupportTickets({ page, limit: PAGE_SIZE, status: statusFilter });
      setTickets(data.tickets || []);
      setTotal(Number(data.total) || 0);
    } catch (e) {
      setError(e.message || 'Không thể tải phiếu hỗ trợ');
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await createSupportTicket({ subject: subject.trim(), body: body.trim() });
      setSubject('');
      setBody('');
      setPage(1);
      const data = await listSupportTickets({ page: 1, limit: PAGE_SIZE, status: statusFilter });
      setTickets(data.tickets || []);
      setTotal(Number(data.total) || 0);
    } catch (err) {
      setError(err.message || 'Không thể gửi phiếu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ManagerPageFrame showNotificationBell>
      <StaffPageShell
        eyebrow="Hệ thống"
        eyebrowIcon={LifeBuoy}
        title="Phiếu hỗ trợ"
        subtitle="Gửi yêu cầu hỗ trợ cho admin và theo dõi phản hồi tại đây."
      >
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900">Gửi phiếu mới</h2>
            <form onSubmit={onSubmit} className="mt-4 grid gap-3">
              <label className="text-sm font-semibold text-slate-700">
                Tiêu đề
                <input
                  type="text"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none ring-teal-200 transition focus:border-teal-300 focus:ring-2"
                  value={subject}
                  onChange={(ev) => setSubject(ev.target.value)}
                  placeholder="Ví dụ: Cần mở khóa cửa hàng"
                  maxLength={200}
                  required
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Nội dung
                <textarea
                  className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-teal-200 transition focus:border-teal-300 focus:ring-2"
                  value={body}
                  onChange={(ev) => setBody(ev.target.value)}
                  placeholder="Mô tả chi tiết vấn đề cần hỗ trợ…"
                  required
                />
              </label>
              <div className="flex justify-end">
                <Button type="submit" className="min-w-[112px]" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {submitting ? 'Đang gửi…' : 'Gửi phiếu'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-visible border-slate-200/80 shadow-sm">
          <CardContent className="overflow-visible p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-900">Phiếu đã gửi</h2>
              <div ref={statusDropdownRef} className="relative">
                <button
                  type="button"
                  className="flex h-10 min-w-[190px] items-center justify-between rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-3 text-sm font-medium text-slate-700 outline-none ring-teal-200 shadow-sm transition hover:border-teal-200 hover:bg-white focus:border-teal-300 focus:ring-2"
                  onClick={() => setStatusDropdownOpen((v) => !v)}
                >
                  <span>
                    {statusFilter === 'open'
                      ? 'Mở'
                      : statusFilter === 'answered'
                        ? 'Đã trả lời'
                        : statusFilter === 'closed'
                          ? 'Đã đóng'
                          : 'Tất cả trạng thái'}
                  </span>
                  <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', statusDropdownOpen && 'rotate-180')} />
                </button>
                {statusDropdownOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-lg shadow-slate-900/10">
                    {[
                      { value: '', label: 'Tất cả trạng thái' },
                      { value: 'open', label: 'Mở' },
                      { value: 'answered', label: 'Đã trả lời' },
                      { value: 'closed', label: 'Đã đóng' },
                    ].map((opt) => (
                      <button
                        key={opt.value || 'all'}
                        type="button"
                        onClick={() => {
                          setPage(1);
                          setStatusFilter(opt.value);
                          setStatusDropdownOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition',
                          statusFilter === opt.value
                            ? 'bg-teal-50 font-semibold text-teal-700'
                            : 'text-slate-700 hover:bg-slate-100'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-14">
                <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
              </div>
            ) : tickets.length === 0 ? (
              <p className="py-14 text-center text-slate-500">Chưa có phiếu hỗ trợ nào.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border-x-0 border-b-0 border border-slate-200/80">
                <table className="w-full min-w-[720px] text-sm text-slate-700">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Tiêu đề</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Cập nhật</th>
                      <th className="px-4 py-3 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {tickets.map((t) => (
                      <tr key={t._id} className="transition-colors odd:bg-white even:bg-slate-50/30 hover:bg-teal-50/40">
                        <td className="px-4 py-3.5 font-medium text-slate-900">{t.subject}</td>
                        <td className="px-4 py-3.5">
                          <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusClassName(t.status))}>
                            {statusLabel(t.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                          {t.updatedAt
                            ? new Date(t.updatedAt).toLocaleString('vi-VN')
                            : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Link to={`/manager/support/${t._id}`} className="text-xs font-semibold text-sky-700 hover:text-sky-800 hover:underline">
                            Chi tiết
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                <span>Trang {page}/{totalPages} ({total} phiếu)</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Trước
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Sau
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
