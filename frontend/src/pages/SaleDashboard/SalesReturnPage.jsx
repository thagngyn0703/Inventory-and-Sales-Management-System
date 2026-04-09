import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInvoice } from '../../services/invoicesApi';
import { createReturn } from '../../services/returnsApi';
import { useToast } from '../../contexts/ToastContext';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
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

export default function SalesReturnPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Step 1: search invoice
  const [invoiceInput, setInvoiceInput] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');

  // Step 2: selected items
  const [returnQty, setReturnQty] = useState({}); // { product_id: qty }

  // Step 3: submit
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

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
        reason: reason || 'Khách trả hàng',
      });
      toast(
        message ||
          `Trả hàng thành công! Đã hoàn trả ${items.length} sản phẩm, tổng tiền: ${formatMoney(totalRefund)}`,
        'success'
      );
      setInvoice(null);
      setInvoiceInput('');
      setReturnQty({});
      setReason('');
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
      subtitle="Nhập mã hóa đơn gốc, chọn số lượng trả và xác nhận — đồng bộ giao diện với các màn staff khác."
      headerActions={
        <Button type="button" variant="outline" className="gap-2" onClick={() => navigate('/staff/invoices')}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
      }
      className="max-w-4xl"
    >
      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="space-y-4 p-5 sm:p-6">
        <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#334155' }}>
          <i className="fa-solid fa-magnifying-glass" style={{ marginRight: 8, color: '#0081ff' }} />
          Bước 1: Tìm hóa đơn gốc
        </h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            type="text"
            className="pos-search-input"
            placeholder="Nhập mã hóa đơn (ID)..."
            value={invoiceInput}
            onChange={e => setInvoiceInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoadInvoice()}
            style={{ flex: 1 }}
          />
          <button
            className="warehouse-btn warehouse-btn-primary"
            style={{ background: '#0081ff', color: 'white', padding: '0 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600 }}
            onClick={handleLoadInvoice}
            disabled={loadingInvoice}
          >
            {loadingInvoice ? 'Đang tải...' : 'Tải hóa đơn'}
          </button>
        </div>
        {invoiceError && (
          <div className="warehouse-alert warehouse-alert-error" style={{ marginTop: 12 }}>{invoiceError}</div>
        )}
        </CardContent>
      </Card>

      {/* Step 2: Show invoice & select items */}
      {invoice && (
        <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#334155' }}>
            <i className="fa-solid fa-box-archive" style={{ marginRight: 8, color: '#0081ff' }} />
            Bước 2: Chọn sản phẩm trả lại
          </h3>

          {/* Invoice info summary */}
          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#475569', display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <span><strong>Mã HĐ:</strong> <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{invoice._id}</span></span>
            <span><strong>Ngày:</strong> {formatDate(invoice.invoice_at)}</span>
            <span><strong>Khách hàng:</strong> {invoice.recipient_name || 'Khách lẻ'}</span>
            <span><strong>Tổng tiền HĐ:</strong> <span style={{ color: '#0081ff', fontWeight: 700 }}>{formatMoney(invoice.total_amount)}</span></span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                <th style={{ textAlign: 'left', padding: '10px 0', color: '#64748b', fontWeight: 600, fontSize: 13 }}>Sản phẩm</th>
                <th style={{ textAlign: 'center', padding: '10px 16px', color: '#64748b', fontWeight: 600, fontSize: 13, width: 80 }}>Đã mua</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', color: '#64748b', fontWeight: 600, fontSize: 13, width: 120 }}>Đơn giá</th>
                <th style={{ textAlign: 'center', padding: '10px 0', color: '#64748b', fontWeight: 600, fontSize: 13, width: 120 }}>SL Trả</th>
                <th style={{ textAlign: 'right', padding: '10px 0', color: '#64748b', fontWeight: 600, fontSize: 13, width: 120 }}>Tiền hoàn</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item, idx) => {
                const pid = item.product_id?._id ?? item.product_id;
                const qty = returnQty[pid] || 0;
                const refundLine = qty * (item.unit_price || 0);
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', background: qty > 0 ? '#eff6ff' : 'transparent' }}>
                    <td style={{ padding: '14px 0' }}>
                      <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{item.product_id?.name || 'Sản phẩm'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{item.product_id?.sku || ''}</div>
                    </td>
                    <td style={{ textAlign: 'center', padding: '14px 16px', color: '#475569', fontWeight: 500 }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right', padding: '14px 16px', color: '#475569' }}>{formatMoney(item.unit_price)}</td>
                    <td style={{ textAlign: 'center', padding: '14px 0' }}>
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={qty}
                        onChange={e => updateQty(pid, e.target.value, item.quantity)}
                        className="pos-qty-input"
                        style={{ width: 70, textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ textAlign: 'right', padding: '14px 0', fontWeight: 600, color: qty > 0 ? '#0081ff' : '#94a3b8' }}>
                      {qty > 0 ? formatMoney(refundLine) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ marginTop: 16, padding: '16px 0 0', borderTop: '2px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 20 }}>
            <span style={{ fontSize: 14, color: '#64748b' }}>
              {selectedItems.length} sản phẩm được chọn trả
            </span>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0081ff' }}>
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
          <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#334155' }}>
            <i className="fa-solid fa-pen-to-square" style={{ marginRight: 8, color: '#0081ff' }} />
            Bước 3: Lý do trả hàng & xác nhận
          </h3>
          <textarea
            placeholder="Nhập lý do trả hàng (không bắt buộc)..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', color: '#334155' }}
          />
          {submitError && (
            <div className="warehouse-alert warehouse-alert-error" style={{ marginTop: 12 }}>{submitError}</div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setInvoice(null); setInvoiceInput(''); setReturnQty({}); }}
              style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 600, color: '#475569', fontSize: 14 }}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || selectedItems.length === 0}
              style={{
                padding: '10px 28px', borderRadius: 8, border: 'none',
                background: submitting || selectedItems.length === 0 ? '#94a3b8' : 'linear-gradient(135deg,#ef4444,#dc2626)',
                color: 'white', cursor: submitting || selectedItems.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <i className="fa-solid fa-rotate-left" />
              {submitting ? 'Đang xử lý...' : 'Xác nhận trả hàng'}
            </button>
          </div>
        </CardContent>
        </Card>
      )}
    </StaffPageShell>
  );
}
