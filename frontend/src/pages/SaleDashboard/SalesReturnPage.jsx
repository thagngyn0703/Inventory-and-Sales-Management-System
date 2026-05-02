import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getInvoice } from '../../services/invoicesApi';
import { createReturn, getReturnReasons } from '../../services/returnsApi';
import { useToast } from '../../contexts/ToastContext';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { InlineNotice } from '../../components/ui/inline-notice';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import './SalesPOS.css';

function formatMoney(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('vi-VN'); } catch { return '—'; }
}

export default function SalesReturnPage({ backPathOverride = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const backPath = backPathOverride || (location.pathname.startsWith('/manager') ? '/manager/returns' : '/staff/invoices');

  // Step 1: search invoice
  const [invoiceInput, setInvoiceInput] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');

  // Step 2: selected items
  const [returnQty, setReturnQty] = useState({}); // { product_id: qty }

  // Step 3: submit
  const [reasonCode, setReasonCode] = useState('customer_changed_mind');
  const [reasonNote, setReasonNote] = useState('');
  const [reasonOptions, setReasonOptions] = useState([]);
  const [reasonDropdownOpen, setReasonDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const reasonDropdownRef = useRef(null);

  useEffect(() => {
    getReturnReasons()
      .then((res) => setReasonOptions(res.reasons || []))
      .catch(() => setReasonOptions([]));
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!reasonDropdownRef.current) return;
      if (!reasonDropdownRef.current.contains(event.target)) {
        setReasonDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const normalizedReasonOptions = useMemo(
    () =>
      reasonOptions.length > 0
        ? reasonOptions.filter((r) => r.code !== 'wrong_item')
        : [
            { code: 'customer_changed_mind', label: 'Khách đổi ý' },
            { code: 'defective', label: 'Lỗi nhà sản xuất' },
            { code: 'expired', label: 'Hết hạn sử dụng' },
            { code: 'other', label: 'Lý do khác' },
          ],
    [reasonOptions]
  );
  const selectedReasonLabel =
    normalizedReasonOptions.find((r) => r.code === reasonCode)?.label || 'Chọn lý do';

  const handleLoadInvoice = useCallback(async () => {
    const id = invoiceInput.trim();
    if (!id) return;
    setLoadingInvoice(true);
    setInvoiceError('');
    setInvoice(null);
    setReturnQty({});
    setSubmitError('');
    try {
      const data = await getInvoice(id);
      if (data.status === 'cancelled') {
        setInvoiceError('Hóa đơn này đã bị hủy hoặc đã trả hàng rồi.');
        return;
      }
      setInvoice(data);
      // Default qty = 0 for all items (staff picks what to return)
      const initial = {};
      (data.items || []).forEach(it => {
        const pid = it.product_id?._id ?? it.product_id;
        initial[pid] = 0;
      });
      setReturnQty(initial);
    } catch (e) {
      setInvoiceError(e.message || 'Không tìm thấy hóa đơn');
    } finally {
      setLoadingInvoice(false);
    }
  }, [invoiceInput]);

  const updateQty = (pid, val, max) => {
    const num = Math.max(0, Math.min(max, Number(val) || 0));
    setReturnQty(prev => ({ ...prev, [pid]: num }));
  };

  const selectedItems = invoice
    ? (invoice.items || []).filter(it => {
        const pid = it.product_id?._id ?? it.product_id;
        return returnQty[pid] > 0;
      })
    : [];

  const totalRefund = selectedItems.reduce((s, it) => {
    const pid = it.product_id?._id ?? it.product_id;
    return s + (returnQty[pid] || 0) * (it.unit_price || 0);
  }, 0);

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      setSubmitError('Vui lòng chọn ít nhất 1 sản phẩm để trả.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const items = selectedItems.map(it => {
        const pid = it.product_id?._id ?? it.product_id;
        return {
          product_id: pid,
          quantity: returnQty[pid],
          unit_price: it.unit_price || 0,
        };
      });
      const { message } = await createReturn({
        invoice_id: invoice._id,
        items,
        reason_code: reasonCode || 'other',
        reason: reasonNote || 'Khách trả hàng',
      });
      toast(
        message ||
          `Trả hàng thành công! Đã hoàn trả ${items.length} sản phẩm, tổng tiền: ${formatMoney(totalRefund)}`,
        'success'
      );
      setInvoice(null);
      setInvoiceInput('');
      setReturnQty({});
      setReasonCode('customer_changed_mind');
      setReasonNote('');
    } catch (e) {
      setSubmitError(e.message || 'Lỗi khi thực hiện trả hàng');
      toast(e.message || 'Lỗi khi thực hiện trả hàng', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffPageShell
      eyebrow="Bán hàng"
      eyebrowIcon={RotateCcw}
      eyebrowTone="rose"
      title="Trả hàng bán"
      subtitle="Nhập mã hóa đơn gốc, chọn số lượng trả và xác nhận."
      headerActions={
        <Button type="button" variant="outline" className="gap-2" onClick={() => navigate(backPath)}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
      }
      className="max-w-4xl"
    >
      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="space-y-4 p-5 sm:p-6">
        <h3 className="m-0 text-sm font-semibold text-slate-700">
          <i className="fa-solid fa-magnifying-glass mr-2 text-sky-500" />
          Bước 1: Tìm hóa đơn gốc
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2"
            placeholder="Nhập mã hóa đơn (ID)..."
            value={invoiceInput}
            onChange={e => setInvoiceInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoadInvoice()}
          />
          <Button
            type="button"
            className="h-11 min-w-[120px]"
            onClick={handleLoadInvoice}
            disabled={loadingInvoice}
          >
            {loadingInvoice ? 'Đang tải...' : 'Tải hóa đơn'}
          </Button>
        </div>
        <InlineNotice message={invoiceError} type="error" className="mt-3" />
        </CardContent>
      </Card>

      {/* Step 2: Show invoice & select items */}
      {invoice && (
        <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <h3 className="m-0 text-sm font-semibold text-slate-700">
            <i className="fa-solid fa-box-archive mr-2 text-sky-500" />
            Bước 2: Chọn sản phẩm trả lại
          </h3>

          {/* Invoice info summary */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span><strong>Mã HĐ:</strong> <span className="font-mono text-[11px]">{invoice._id}</span></span>
            <span><strong>Ngày:</strong> {formatDate(invoice.invoice_at)}</span>
            <span><strong>Khách hàng:</strong> {invoice.recipient_name || 'Khách lẻ'}</span>
            <span><strong>Tổng tiền HĐ:</strong> <span className="font-bold text-sky-600">{formatMoney(invoice.total_amount)}</span></span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="w-20 px-3 py-2 text-center">Đã mua</th>
                <th className="w-28 px-3 py-2 text-right">Đơn giá</th>
                <th className="w-28 px-3 py-2 text-center">SL trả</th>
                <th className="w-28 px-3 py-2 text-right">Tiền hoàn</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item, idx) => {
                const pid = item.product_id?._id ?? item.product_id;
                const qty = returnQty[pid] || 0;
                const refundLine = qty * (item.unit_price || 0);
                return (
                  <tr key={idx} className={`border-b border-slate-100 ${qty > 0 ? 'bg-sky-50/50' : 'bg-white'}`}>
                    <td className="px-3 py-3">
                      <div className="text-sm font-semibold text-slate-800">{item.product_id?.name || 'Sản phẩm'}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{item.product_id?.sku || ''}</div>
                    </td>
                    <td className="px-3 py-3 text-center font-medium text-slate-700">{item.quantity}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatMoney(item.unit_price)}</td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={qty}
                        onChange={e => updateQty(pid, e.target.value, item.quantity)}
                        className="h-9 w-20 rounded-lg border border-slate-200 text-center text-sm outline-none ring-sky-200 focus:ring-2"
                      />
                    </td>
                    <td className={`px-3 py-3 text-right font-semibold ${qty > 0 ? 'text-sky-600' : 'text-slate-400'}`}>
                      {qty > 0 ? formatMoney(refundLine) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {/* Totals */}
          <div className="mt-2 flex items-center justify-end gap-4 border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-500">
              {selectedItems.length} sản phẩm được chọn trả
            </span>
            <div className="text-lg font-bold text-sky-600">
              Hoàn tiền: {formatMoney(totalRefund)}
            </div>
          </div>
        </CardContent>
        </Card>
      )}

      {/* Step 3: Reason & submit */}
      {invoice && (
        <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <h3 className="m-0 text-sm font-semibold text-slate-700">
            <i className="fa-solid fa-pen-to-square mr-2 text-sky-500" />
            Bước 3: Lý do trả hàng & xác nhận
          </h3>
          <div className="grid gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Phân loại lý do
              </label>
              <div className="relative" ref={reasonDropdownRef}>
                <button
                  type="button"
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
                  onClick={() => setReasonDropdownOpen((prev) => !prev)}
                >
                  <span>{selectedReasonLabel}</span>
                  <i className={`fa-solid fa-chevron-${reasonDropdownOpen ? 'up' : 'down'} text-xs text-slate-400`} />
                </button>
                {reasonDropdownOpen && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                    {normalizedReasonOptions.map((r) => (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => {
                          setReasonCode(r.code);
                          setReasonDropdownOpen(false);
                        }}
                        className={`flex w-full items-center rounded-lg px-3 py-2 text-sm transition ${
                          reasonCode === r.code
                            ? 'bg-sky-50 text-sky-700'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ghi chú chi tiết (tuỳ chọn)
              </label>
              <textarea
                placeholder="Ví dụ: Lỗi ở khóa kéo, khách yêu cầu đổi size..."
                value={reasonNote}
                onChange={e => setReasonNote(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
              />
            </div>
          </div>
          <InlineNotice message={submitError} type="error" className="mt-3" />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setInvoice(null); setInvoiceInput(''); setReturnQty({}); setReasonCode('customer_changed_mind'); setReasonNote(''); }}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || selectedItems.length === 0}
              className="gap-2 bg-rose-600 hover:bg-rose-700"
            >
              <i className="fa-solid fa-rotate-left" />
              {submitting ? 'Đang xử lý...' : 'Xác nhận trả hàng'}
            </Button>
          </div>
        </CardContent>
        </Card>
      )}
    </StaffPageShell>
  );
}
