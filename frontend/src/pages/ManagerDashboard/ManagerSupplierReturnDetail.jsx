import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { RotateCcw } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { InlineNotice } from '../../components/ui/inline-notice';
import { getSupplierReturnDetail } from '../../services/suppliersApi';

function fmtMoney(v) {
  return `${Number(v || 0).toLocaleString('vi-VN')}₫`;
}

export default function ManagerSupplierReturnDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState(null);
  const [allocations, setAllocations] = useState([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    getSupplierReturnDetail(id)
      .then((data) => {
        setDoc(data.supplier_return || null);
        setAllocations(data.allocations || []);
      })
      .catch((e) => setError(e.message || 'Không tải được phiếu trả NCC'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <ManagerPageFrame showNotificationBell={false}>
      <StaffPageShell
        eyebrow="Mua hàng & NCC"
        eyebrowIcon={RotateCcw}
        title="Chi tiết phiếu trả NCC"
        subtitle={doc?.supplier_id?.name || 'Nhà cung cấp'}
        headerActions={<Button type="button" variant="outline" onClick={() => navigate(-1)}>Quay lại</Button>}
      >
        <InlineNotice message={error} type="error" className="mb-3" />
        {loading ? (
          <p className="py-10 text-center text-slate-500">Đang tải...</p>
        ) : !doc ? (
          <p className="py-10 text-center text-slate-500">Không tìm thấy dữ liệu.</p>
        ) : (
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="space-y-3 p-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div><span className="text-slate-500">Mã phiếu:</span> <span className="font-mono font-semibold text-slate-800">{String(doc._id).slice(-6).toUpperCase()}</span></div>
                <div><span className="text-slate-500">Thời gian:</span> <span className="font-medium text-slate-800">{new Date(doc.return_date || doc.created_at).toLocaleString('vi-VN')}</span></div>
                <div><span className="text-slate-500">Nhà cung cấp:</span> <span className="font-medium text-slate-800">{doc.supplier_id?.name || '—'}</span></div>
                <div><span className="text-slate-500">Giá trị trả:</span> <span className="font-semibold text-rose-700">{fmtMoney(doc.total_amount)}</span></div>
                <div><span className="text-slate-500">Người tạo:</span> <span className="text-slate-800">{doc.created_by?.fullName || doc.created_by?.email || '—'}</span></div>
                <div><span className="text-slate-500">Trạng thái:</span> <Badge variant="outline">{doc.status || 'approved'}</Badge></div>
              </div>
              {doc.reason && <div><span className="text-slate-500">Lý do:</span> <span className="text-slate-800">{doc.reason}</span></div>}
              {doc.note && <div><span className="text-slate-500">Ghi chú:</span> <span className="text-slate-800">{doc.note}</span></div>}
              {doc.reference_code && <div><span className="text-slate-500">Mã tham chiếu:</span> <span className="font-mono text-slate-700">{doc.reference_code}</span></div>}
              <div className="mt-2">
                <p className="mb-2 text-slate-500">Sản phẩm đã trả</p>
                {!Array.isArray(doc.items) || doc.items.length === 0 ? (
                  <p className="text-slate-500">Không có dữ liệu sản phẩm.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-slate-100">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Sản phẩm</th>
                          <th className="px-3 py-2 text-left font-semibold">SKU</th>
                          <th className="px-3 py-2 text-right font-semibold">Số lượng</th>
                          <th className="px-3 py-2 text-right font-semibold">Đơn giá</th>
                          <th className="px-3 py-2 text-right font-semibold">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doc.items.map((item, idx) => (
                          <tr key={`${item.product_id?._id || item.product_id || 'item'}-${idx}`} className="border-t border-slate-100">
                            <td className="px-3 py-2">
                              {item.product_id?.name || item.product_name_snapshot || '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px]">
                              {item.product_id?.sku || item.product_sku_snapshot || '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800">
                              {Number(item.quantity || 0).toLocaleString('vi-VN')} {item.unit_name || item.product_id?.base_unit || ''}
                            </td>
                            <td className="px-3 py-2 text-right">{fmtMoney(item.unit_cost || 0)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800">
                              {fmtMoney(item.line_total || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="mt-2">
                <p className="mb-2 text-slate-500">Payable đã bù trừ</p>
                {allocations.length === 0 ? (
                  <p className="text-slate-500">Chưa có dữ liệu phân bổ.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-slate-100">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Payable</th>
                          <th className="px-3 py-2 text-right font-semibold">Số tiền bù</th>
                          <th className="px-3 py-2 text-left font-semibold">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocations.map((item) => (
                          <tr key={item._id} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-mono">
                              {item.payable_id?._id ? (
                                <Link className="underline text-teal-700 hover:text-teal-500" to={`/manager/supplier-payables/${item.payable_id._id}`}>
                                  {String(item.payable_id._id).slice(-6).toUpperCase()}
                                </Link>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtMoney(item.amount || 0)}</td>
                            <td className="px-3 py-2">{item.payable_id?.status || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
