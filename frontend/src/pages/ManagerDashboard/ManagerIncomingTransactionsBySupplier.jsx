import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Truck } from 'lucide-react';
import { getSuppliers } from '../../services/suppliersApi';
import { getPurchaseOrders, getGoodsReceipts } from '../../services/incomingTransactionsApi';
import { cn } from '../../lib/utils';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const PO_STATUS_LABEL = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  received: 'Đã nhận',
  cancelled: 'Đã hủy',
};

const GR_STATUS_LABEL = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

/** Còn nợ NCC: ưu tiên SupplierPayable (sau thanh toán bổ sung), không chỉ snapshot lúc duyệt. */
function goodsReceiptHasSupplierDebt(gr) {
  if (gr.status !== 'approved') return false;
  if (gr.supplier_payable != null) {
    return Number(gr.supplier_payable.remaining_amount) > 0;
  }
  const pt = gr.payment_type;
  if (pt === 'credit') return true;
  if (pt === 'partial') {
    const total = Number(gr.total_amount) || 0;
    const paid = Number(gr.amount_paid_at_approval) || 0;
    return total > paid;
  }
  return false;
}

/** Đã trả đủ NCC theo sổ công nợ (kể cả trả sau duyệt). */
function goodsReceiptSupplierFullyPaid(gr) {
  if (gr.status !== 'approved' || gr.supplier_payable == null) return false;
  return Number(gr.supplier_payable.remaining_amount) <= 0;
}

/** Nhãn cột trạng thái — đồng bộ với màn công nợ NCC. */
function goodsReceiptStatusDisplayLabel(gr) {
  const base = GR_STATUS_LABEL[gr.status] ?? gr.status;
  if (gr.status !== 'approved') return base;
  if (goodsReceiptSupplierFullyPaid(gr)) {
    if (gr.payment_type && gr.payment_type !== 'cash') {
      return 'Đã duyệt (đã trả đủ NCC)';
    }
    return base;
  }
  if (gr.payment_type === 'credit') {
    return 'Đã duyệt (ghi nợ)';
  }
  if (gr.payment_type === 'partial' && goodsReceiptHasSupplierDebt(gr)) {
    return 'Đã duyệt (trả một phần, ghi nợ)';
  }
  return base;
}

function goodsReceiptStatusPillClass(status, gr) {
  if (status === 'pending') {
    return 'border-amber-200/90 bg-amber-100 text-amber-950 ring-1 ring-amber-200/60';
  }
  if (status === 'approved') {
    if (gr && goodsReceiptHasSupplierDebt(gr)) {
      return 'border-teal-200/90 bg-teal-50 text-teal-950 ring-1 ring-teal-200/70';
    }
    return 'border-emerald-200/90 bg-emerald-100 text-emerald-950 ring-1 ring-emerald-200/60';
  }
  if (status === 'rejected') {
    return 'border-red-200/90 bg-red-100 text-red-950 ring-1 ring-red-200/60';
  }
  if (status === 'draft') {
    return 'border-slate-200 bg-slate-100 text-slate-800 ring-1 ring-slate-200/80';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700 ring-1 ring-slate-200/60';
}

function purchaseOrderStatusPillClass(status) {
  if (status === 'pending') {
    return 'border-amber-200/90 bg-amber-100 text-amber-950 ring-1 ring-amber-200/60';
  }
  if (status === 'approved') {
    return 'border-sky-200/90 bg-sky-100 text-sky-950 ring-1 ring-sky-200/60';
  }
  if (status === 'received') {
    return 'border-emerald-200/90 bg-emerald-100 text-emerald-950 ring-1 ring-emerald-200/60';
  }
  if (status === 'cancelled') {
    return 'border-red-200/90 bg-red-100 text-red-950 ring-1 ring-red-200/60';
  }
  if (status === 'draft') {
    return 'border-slate-200 bg-slate-100 text-slate-800 ring-1 ring-slate-200/80';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700 ring-1 ring-slate-200/60';
}

export default function ManagerIncomingTransactionsBySupplier() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [poTotal, setPoTotal] = useState(0);
  const [grTotal, setGrTotal] = useState(0);
  const [poPage, setPoPage] = useState(1);
  const [grPage, setGrPage] = useState(1);
  const [poTotalPages, setPoTotalPages] = useState(1);
  const [grTotalPages, setGrTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSuppliers = useCallback(async () => {
    try {
      const list = await getSuppliers();
      setSuppliers(list || []);
    } catch (e) {
      setError(e.message || 'Không thể tải danh sách nhà cung cấp');
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [poResp, grResp] = await Promise.all([
        getPurchaseOrders({
          page: poPage,
          limit: 10,
          supplierId: supplierId || undefined,
        }),
        getGoodsReceipts({
          page: grPage,
          limit: 10,
          supplierId: supplierId || undefined,
        }),
      ]);
      setPurchaseOrders(poResp.purchaseOrders || []);
      setGoodsReceipts(grResp.goodsReceipts || []);
      setPoTotal(poResp.total ?? 0);
      setGrTotal(grResp.total ?? 0);
      setPoTotalPages(poResp.totalPages ?? 1);
      setGrTotalPages(grResp.totalPages ?? 1);
    } catch (e) {
      setError(e.message || 'Không thể tải giao dịch đến');
      setPurchaseOrders([]);
      setGoodsReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId, poPage, grPage]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  useEffect(() => {
    setPoPage(1);
    setGrPage(1);
  }, [supplierId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');
  const formatMoney = (n) => Number(n || 0).toLocaleString('vi-VN') + '₫';

  return (
    <ManagerPageFrame
      showNotificationBell={false}
      topBarLeft={
        <div className="w-full min-w-0 max-w-sm">
          <select
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-teal-200/80 focus:ring-2"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Tất cả nhà cung cấp</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <StaffPageShell
        eyebrow="Mua hàng & NCC"
        eyebrowIcon={Truck}
        title="Giao dịch đến theo nhà cung cấp"
        subtitle="Đơn mua hàng và phiếu nhập kho — lọc NCC trên thanh trên."
      >
          {error && <div className="manager-products-error">{error}</div>}

          {loading ? (
            <p className="manager-products-loading">Đang tải...</p>
          ) : (
            <>
              <div className="manager-panel-card manager-products-card rounded-2xl border border-slate-200/80 shadow-sm" style={{ marginBottom: 24 }}>
                <h2 className="text-lg font-bold text-slate-900" style={{ marginBottom: 12, padding: '16px 16px 0' }}>
                  Đơn mua hàng
                </h2>
                <div className="manager-products-table-wrap">
                  <table className="manager-products-table">
                    <thead>
                      <tr>
                        <th>Mã</th>
                        <th>Nhà cung cấp</th>
                        <th>Ngày tạo</th>
                        <th>Trạng thái</th>
                        <th>Tổng tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="manager-products-empty">
                            Không có đơn mua hàng nào.
                          </td>
                        </tr>
                      ) : (
                        purchaseOrders.map((po) => (
                          <tr key={po._id}>
                            <td>{po._id?.slice(-8)}</td>
                            <td>{po.supplier_id?.name ?? '—'}</td>
                            <td>{formatDate(po.created_at)}</td>
                            <td>
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                                  purchaseOrderStatusPillClass(po.status)
                                )}
                              >
                                {PO_STATUS_LABEL[po.status] ?? po.status}
                              </span>
                            </td>
                            <td>{formatMoney(po.total_amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {poTotalPages > 1 && (
                    <div
                      style={{
                        padding: '16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>
                        Trang {poPage} / {poTotalPages} (tổng {poTotal})
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="manager-btn-secondary"
                          onClick={() => setPoPage((p) => Math.max(1, p - 1))}
                          disabled={poPage <= 1}
                        >
                          Trước
                        </button>
                        <button
                          type="button"
                          className="manager-btn-secondary"
                          onClick={() => setPoPage((p) => Math.min(poTotalPages, p + 1))}
                          disabled={poPage >= poTotalPages}
                        >
                          Sau
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="manager-panel-card manager-products-card rounded-2xl border border-slate-200/80 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900" style={{ marginBottom: 12, padding: '16px 16px 0' }}>
                  Phiếu nhập kho
                </h2>
                <div className="manager-products-table-wrap">
                  <table className="manager-products-table">
                    <thead>
                      <tr>
                        <th>Mã</th>
                        <th>Nhà cung cấp</th>
                        <th>Ngày nhận</th>
                        <th>Trạng thái</th>
                        <th>Tổng tiền</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {goodsReceipts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="manager-products-empty">
                            Không có phiếu nhập kho nào.
                          </td>
                        </tr>
                      ) : (
                        goodsReceipts.map((gr) => (
                          <tr key={gr._id}>
                            <td>
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600, padding: 0 }}
                                onClick={() => navigate(`/manager/receipts/${gr._id}`)}
                              >
                                {gr._id?.slice(-8).toUpperCase()}
                              </button>
                            </td>
                            <td>{gr.supplier_id?.name ?? '—'}</td>
                            <td>{formatDate(gr.received_at)}</td>
                            <td>
                              <span
                                className={cn(
                                  'inline-flex max-w-[220px] flex-wrap items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-snug',
                                  goodsReceiptStatusPillClass(gr.status, gr)
                                )}
                                title={
                                  gr.status === 'approved' && gr.payment_type
                                    ? `Hình thức thanh toán khi duyệt: ${
                                        gr.payment_type === 'cash'
                                          ? 'Trả đủ ngay'
                                          : gr.payment_type === 'credit'
                                            ? 'Ghi nợ'
                                            : 'Trả một phần'
                                      }`
                                    : undefined
                                }
                              >
                                {goodsReceiptStatusDisplayLabel(gr)}
                              </span>
                            </td>
                            <td>{formatMoney(gr.total_amount)}</td>
                            <td>
                              <button
                                type="button"
                                className="manager-btn-secondary"
                                style={{ padding: '4px 12px', fontSize: 13 }}
                                onClick={() => navigate(`/manager/receipts/${gr._id}`)}
                              >
                                Chi tiết
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {grTotalPages > 1 && (
                    <div
                      style={{
                        padding: '16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>
                        Trang {grPage} / {grTotalPages} (tổng {grTotal})
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="manager-btn-secondary"
                          onClick={() => setGrPage((p) => Math.max(1, p - 1))}
                          disabled={grPage <= 1}
                        >
                          Trước
                        </button>
                        <button
                          type="button"
                          className="manager-btn-secondary"
                          onClick={() => setGrPage((p) => Math.min(grTotalPages, p + 1))}
                          disabled={grPage >= grTotalPages}
                        >
                          Sau
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
