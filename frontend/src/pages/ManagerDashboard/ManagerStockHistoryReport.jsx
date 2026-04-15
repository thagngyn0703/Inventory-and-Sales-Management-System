import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { InlineNotice } from '../../components/ui/inline-notice';
import { getStockHistories } from '../../services/stockHistoriesApi';

const LIMIT = 20;

function getReferencePath(row) {
  const refId = row?.reference_id;
  if (!refId) return null;
  switch (String(row?.type || '').toUpperCase()) {
    case 'OUT_SALES':
    case 'IN_SALES_RETURN':
      return `/manager/invoices/${refId}`;
    case 'IN_GR':
      return `/manager/receipts/${refId}`;
    case 'ADJ_STOCKTAKE':
    case 'REV_STOCKTAKE':
      return `/manager/stocktakes/${refId}`;
    default:
      return null;
  }
}

export default function ManagerStockHistoryReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [type, setType] = useState('');
  const [productKeyword, setProductKeyword] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getStockHistories({
        page,
        limit: LIMIT,
        type: type || undefined,
        q: productKeyword || undefined,
        reference_id: referenceId || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      setRows(data.histories || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setError(e.message || 'Không tải được báo cáo thẻ kho');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, type, productKeyword, referenceId, fromDate, toDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onApplyFilters = () => {
    setPage(1);
    fetchData();
  };

  return (
    <ManagerPageFrame showNotificationBell={false}>
      <StaffPageShell
        eyebrow="Kho & kiểm kê"
        eyebrowIcon={ClipboardList}
        title="Báo cáo thẻ kho"
        subtitle="Tra cứu toàn bộ biến động kho theo thời gian, loại giao dịch và chứng từ."
        headerActions={<Badge className="border border-indigo-200 bg-indigo-100 text-indigo-800">Tổng: {total} dòng</Badge>}
      >
        <InlineNotice message={error} type="error" className="mb-4" />

        <Card className="rounded-2xl border border-slate-200/80 shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
                <option value="">Tất cả loại</option>
                <option value="IN_GR">Nhập hàng</option>
                <option value="OUT_SALES">Bán hàng</option>
                <option value="IN_SALES_RETURN">Trả hàng</option>
                <option value="ADJ_STOCKTAKE">Điều chỉnh kiểm kê</option>
                <option value="REV_STOCKTAKE">Hoàn tác kiểm kê</option>
              </select>
              <input
                value={productKeyword}
                onChange={(e) => setProductKeyword(e.target.value)}
                placeholder="Tên sản phẩm / SKU"
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
              <input
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
                placeholder="reference_id"
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm" />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm" />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={onApplyFilters}>Áp dụng bộ lọc</Button>
            </div>

            {loading ? (
              <p className="py-10 text-center text-sm text-slate-500">Đang tải dữ liệu thẻ kho...</p>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Không có dữ liệu theo bộ lọc hiện tại.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Thời gian</th>
                      <th className="px-4 py-3 text-left font-semibold">Sản phẩm</th>
                      <th className="px-4 py-3 text-left font-semibold">Loại</th>
                      <th className="px-4 py-3 text-left font-semibold">Chứng từ</th>
                      <th className="px-4 py-3 text-right font-semibold">Biến động</th>
                      <th className="px-4 py-3 text-right font-semibold">Tồn sau</th>
                      <th className="px-4 py-3 text-left font-semibold">Người thao tác</th>
                      <th className="px-4 py-3 text-left font-semibold">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row._id} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">{new Date(row.timestamp || row.created_at).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <div className="font-medium">{row.product_id?.name || '—'}</div>
                          <div className="text-xs text-slate-500">{row.product_id?.sku || ''}</div>
                        </td>
                        <td className="px-4 py-3"><Badge variant="outline">{row.type}</Badge></td>
                        <td className="px-4 py-3 font-mono text-xs text-teal-700">
                          {row.reference_code ? (
                            getReferencePath(row) ? (
                              <Link className="underline hover:text-teal-500" to={getReferencePath(row)}>
                                {row.reference_code}
                              </Link>
                            ) : row.reference_code
                          ) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${String(row.change || '').startsWith('-') ? 'text-rose-700' : 'text-emerald-700'}`}>{row.change}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.balance}</td>
                        <td className="px-4 py-3 text-slate-600">{row.actor_name || 'Hệ thống'}</td>
                        <td className="px-4 py-3 text-slate-500">{row.note || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">Trang {page} / {totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Trước</Button>
            <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sau</Button>
          </div>
        </div>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
