import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Search, X } from 'lucide-react';
import { getReturns } from '../../services/returnsApi';
import { getInvoiceDisplayCode } from '../../utils/invoiceDisplayCode';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

const LIMIT = 10;

export default function ManagerReturnsListPage() {
  const navigate = useNavigate();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchKey, setSearchKey] = useState('');

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getReturns({
        page,
        limit: LIMIT,
        searchKey: searchKey.trim() || undefined,
      });
      setReturns(data.returns || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setError(e.message || 'Không thể tải danh sách trả hàng');
      setReturns([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, searchKey]);

  useEffect(() => {
    setPage(1);
  }, [searchKey]);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  const fmtDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
  };

  const fmtMoney = (n) => `${Number(n || 0).toLocaleString('vi-VN')}₫`;

  const returnSlipCode = (rt) => String(rt._id || '').slice(-10).toUpperCase();

  const staffName = (rt) => rt.created_by?.fullName || rt.created_by?.email || '—';

  const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const end = Math.min(page * LIMIT, total);

  return (
    <ManagerPageFrame>
      <StaffPageShell
        eyebrow="Kho & bán hàng"
        eyebrowIcon={RotateCcw}
        eyebrowTone="rose"
        title="Danh sách trả hàng"
        subtitle="Mỗi dòng là một phiếu trả hàng, liên kết ngược về hóa đơn bán gốc."
      >
        {error && <div className="manager-products-error">{error}</div>}

        <Card className="mb-4 border-slate-200/80 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tìm kiếm
            </label>
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Mã HĐ, mã phiếu trả, khách hàng, nhân viên..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm outline-none ring-sky-200 focus:ring-2"
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
              />
              {searchKey && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  onClick={() => setSearchKey('')}
                  aria-label="Xóa tìm kiếm"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="manager-panel-card manager-products-card rounded-2xl border border-slate-200/80 shadow-sm">
          {loading ? (
            <p className="manager-products-loading">Đang tải...</p>
          ) : returns.length === 0 ? (
            <p className="manager-products-loading">
              {searchKey.trim() ? 'Không tìm thấy phiếu trả hàng phù hợp.' : 'Chưa có phiếu trả hàng nào.'}
            </p>
          ) : (
            <>
              <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
                Tổng <strong className="text-slate-900">{total}</strong> phiếu
                {total > 0 && (
                  <>
                    {' '}
                    — hiển thị {start}–{end}
                  </>
                )}
              </div>
              <div className="manager-products-table-wrap">
                <table className="manager-products-table">
                  <thead>
                    <tr>
                      <th>Ngày trả</th>
                      <th>Mã phiếu trả</th>
                      <th>Hóa đơn gốc</th>
                      <th>Nhân viên</th>
                      <th>Lý do</th>
                      <th>Mặt hàng</th>
                      <th style={{ textAlign: 'right' }}>Tổng hoàn</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((rt) => (
                      <tr key={rt._id}>
                        <td>{fmtDate(rt.return_at || rt.created_at)}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{returnSlipCode(rt)}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {getInvoiceDisplayCode(rt.invoice_id) || '—'}
                        </td>
                        <td>{staffName(rt)}</td>
                        <td>{rt.reason || 'Khách trả hàng'}</td>
                        <td>{(rt.items || []).length}</td>
                        <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>
                          {fmtMoney(rt.total_amount)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="manager-btn-secondary"
                            style={{ padding: '6px 12px', fontSize: 13 }}
                            onClick={() => navigate(`/manager/returns/${rt._id}`)}
                          >
                            Xem phiếu trả
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
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
              )}
            </>
          )}
        </div>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
