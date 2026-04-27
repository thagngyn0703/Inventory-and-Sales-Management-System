import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LifeBuoy, Loader2, MessageSquare } from 'lucide-react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { getSupportTicket, replySupportTicket } from '../../services/supportTicketsApi';

function statusLabel(s) {
  if (s === 'answered') return 'Đã trả lời';
  if (s === 'closed') return 'Đã đóng';
  return 'Mở';
}

function statusPillClass(s) {
  if (s === 'answered') return 'border-emerald-200 bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200';
  if (s === 'closed') return 'border-slate-300 bg-slate-200 text-slate-700 ring-1 ring-slate-200';
  return 'border-sky-200 bg-sky-100 text-sky-900 ring-1 ring-sky-200';
}

export default function ManagerSupportTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getSupportTicket(id);
      setTicket(data.ticket || null);
    } catch (e) {
      setError(e.message || 'Không thể tải phiếu');
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onSendReply = async (e) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text || !id) return;
    setSending(true);
    setError('');
    try {
      const data = await replySupportTicket(id, text);
      setTicket(data.ticket || null);
      setReply('');
    } catch (err) {
      setError(err.message || 'Không thể gửi');
    } finally {
      setSending(false);
    }
  };

  return (
    <ManagerPageFrame showNotificationBell>
      <StaffPageShell
        eyebrow="Hệ thống"
        eyebrowIcon={LifeBuoy}
        title="Chi tiết phiếu hỗ trợ"
        subtitle="Theo dõi trao đổi giữa bạn và admin cho phiếu hỗ trợ này."
        headerActions={(
          <Button type="button" variant="outline" className="gap-2" onClick={() => navigate('/manager/support')}>
            <ArrowLeft className="h-4 w-4" />
            Danh sách
          </Button>
        )}
      >
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="flex justify-center py-14">
              <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
            </CardContent>
          </Card>
        ) : !ticket ? (
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent>
              <p className="py-10 text-center text-slate-500">Không tìm thấy phiếu.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-slate-200/80 shadow-sm">
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">Trạng thái:</span>
                  <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusPillClass(ticket.status))}>
                    {statusLabel(ticket.status)}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-slate-900">{ticket.subject}</h2>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {ticket.body}
                </div>
                <p className="text-xs text-slate-500">
                  Gửi lúc {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('vi-VN') : '—'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 shadow-sm">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-slate-500" />
                  <h3 className="text-base font-semibold text-slate-900">Trao đổi</h3>
                </div>

                {(ticket.replies || []).length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                    Chưa có phản hồi từ admin.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {ticket.replies.map((r) => (
                      <div
                        key={r._id}
                        className={cn(
                          'rounded-xl border px-3 py-2.5 text-sm',
                          r.role === 'admin'
                            ? 'border-blue-200 bg-blue-50/80'
                            : 'border-slate-200 bg-slate-50'
                        )}
                      >
                        <p className="text-xs font-semibold text-slate-700">
                          {r.role === 'admin' ? 'Admin' : 'Bạn'}
                          <span className="ml-2 font-normal text-slate-500">
                            {r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN') : ''}
                          </span>
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-slate-700">{r.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                {ticket.status !== 'closed' ? (
                  <form onSubmit={onSendReply} className="space-y-3 border-t border-slate-100 pt-3">
                    <label className="block text-sm font-semibold text-slate-700">
                      Bổ sung / trả lời
                      <textarea
                        className="mt-1 min-h-[92px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-teal-200 transition focus:border-teal-300 focus:ring-2"
                        value={reply}
                        onChange={(ev) => setReply(ev.target.value)}
                        placeholder="Nhập nội dung..."
                        required
                      />
                    </label>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={sending}>
                        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {sending ? 'Đang gửi…' : 'Gửi'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                    Phiếu đã đóng.
                  </p>
                )}
              </CardContent>
            </Card>

            <div>
              <Link to="/manager/support" className="inline-flex items-center text-sm font-semibold text-sky-700 hover:text-sky-800 hover:underline">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Về danh sách
              </Link>
            </div>
          </>
        )}
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
