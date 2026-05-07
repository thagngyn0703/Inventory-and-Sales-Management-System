import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { InlineNotice } from '../../components/ui/inline-notice';
import { exportSupplierReturnsExcel, getSupplierReturns } from '../../services/suppliersApi';

const LIMIT = 20;

function fmtMoney(v) {
  return `${Number(v || 0).toLocaleString('vi-VN')}₫`;
}

export default function ManagerSupplierReturnsList() {
  const [searchParams] = useSearchParams();
  const supplierIdFromQuery = searchParams.get('supplier_id') || '';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSupplierReturns({
        supplier_id: supplierIdFromQuery || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        page,
        limit: LIMIT,
      });
      setRows(data.returns || []);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setRows([]);
      setError(e.message || 'Không thể tải danh sách phiếu trả NCC');
    } finally {
      setLoading(false);
    }
  }, [supplierIdFromQuery, fromDate, toDate, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ManagerPageFrame showNotificationBell>
      <StaffPageShell
        eyebrow="Mua hàng & NCC"
        eyebrowIcon={RotateCcw}
        title="Danh sách phiếu trả NCC"
        subtitle={supplierIdFromQuery ? `Lọc theo NCC #${supplierIdFromQuery.slice(-6).toUpperCase()}` : 'Toàn cửa hàng'}
        headerActions={(
          <Button asChild>
            <Link to="/manager/supplier-returns/new">Tạo phiếu trả NCC</Link>
          </Button>
        )}
      >
        <InlineNotice message={error} type="error" className="mb-3" />
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm" />
              <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm" />
              <Button
                type="button"
                variant="outline"
                disabled={exporting}
                onClick={async () => {
                  try {
                    setExporting(true);
                    const blob = await exportSupplierReturnsExcel({
                      supplier_id: supplierIdFromQuery || undefined,
                      from_date: fromDate || undefined,
                      to_date: toDate || undefined,
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'phieu-tra-ncc.xlsx';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting ? 'Đang xuất...' : 'Xuất Excel'}
              </Button>
            </div>

            {loading ? (
              <p className="py-10 text-center text-slate-500">Đang tải...</p>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-slate-500">Chưa có phiếu trả NCC.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Ngày</th>
                      <th className="px-4 py-3 text-left font-semibold">Mã phiếu</th>
                      <th className="px-4 py-3 text-left font-semibold">Nhà cung cấp</th>
                      <th className="px-4 py-3 text-right font-semibold">Giá trị trả</th>
                      <th className="px-4 py-3 text-left font-semibold">Lý do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row._id} className="border-t border-slate-100">
                        <td className="px-4 py-3">{new Date(row.return_date || row.created_at).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 font-mono text-xs text-teal-700">
                          <Link className="underline hover:text-teal-500" to={`/manager/supplier-returns/${row._id}`}>
                            {String(row._id).slice(-6).toUpperCase()}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{row.supplier_id?.name || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-rose-700">{fmtMoney(row.total_amount || 0)}</td>
                        <td className="px-4 py-3 text-slate-600">{row.reason || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Trang {page}/{totalPages}</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Trước</Button>
                <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sau</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
