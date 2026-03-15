import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getInvoice, createInvoice, updateInvoice, submitInvoice, cancelInvoice } from '../../services/invoicesApi';
import { getProducts } from '../../services/productsApi';
import { getCurrentUser } from '../../utils/auth';

const STATUS_LABEL = {
  draft: 'Nháp',
  submitted: 'Đã gửi',
  confirmed: 'Đã duyệt',
  paid: 'Đã thanh toán',
  cancelled: 'Đã hủy',
};

function formatMoney(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

export default function WarehouseInvoiceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new' || !id || id === 'undefined' || id === 'null';
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const user = getCurrentUser();
  const role = user?.role || '';
  const isWarehouse = ['warehouse', 'warehouse_staff'].includes(role);
  const isSales = ['sales', 'sales_staff'].includes(role);

  const loadProducts = useCallback(async () => {
    try {
      const { products: data = [] } = await getProducts(1, 500);
      setProducts(data);
    } catch (e) { /* ignore */ }
  }, []);

  const loadInvoice = useCallback(async () => {
    if (!id || isNew) return;
    setLoading(true);
    setError('');
    try {
      const data = await getInvoice(id);
      setInvoice(data);
      setPaymentMethod(data.payment_method || 'cash');
      setItems(
        (data.items || []).map((item) => ({
          product_id: item.product_id?._id ?? item.product_id,
          name: item.product_id?.name ?? '',
          sku: item.product_id?.sku ?? '',
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          discount: item.discount || 0,
          line_total: item.line_total || 0,
          in_stock: item.in_stock,
          stock_qty: item.stock_qty,
        }))
      );
    } catch (e) {
      setError(e.message || 'Không thể tải hóa đơn');
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  const handleAddLine = () => {
    setItems((prev) => [
      ...prev,
      { product_id: '', name: '', sku: '', quantity: 1, unit_price: 0, discount: 0, line_total: 0 },
    ]);
  };

  const updateLine = (idx, changes) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...changes };
      const qty = Number(next[idx].quantity) || 0;
      const price = Number(next[idx].unit_price) || 0;
      const discount = Number(next[idx].discount) || 0;
      next[idx].line_total = Math.max(0, qty * price - discount);
      return next;
    });
  };

  const removeLine = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const payload = () => ({
    payment_method: paymentMethod,
    items: items
      .filter((it) => it.product_id)
      .map((it) => {
        const productId =
          typeof it.product_id === 'object' && it.product_id !== null
            ? it.product_id._id || it.product_id.id || null
            : it.product_id;
        return {
          product_id: productId,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          discount: Number(it.discount) || 0,
        };
      })
      .filter((it) => it.product_id),
  });

  const handleSaveDraft = async () => {
    setSaving(true);
    setError('');
    setSuccessMessage('');
    const payloadData = payload();
    if (!payloadData.items || payloadData.items.length === 0) {
      setError('Vui lòng thêm ít nhất một dòng sản phẩm để lưu.');
      setSaving(false);
      return;
    }
    try {
      if (isNew) {
        const created = await createInvoice(payloadData);
        setInvoice(created);
        navigate(`/warehouse/invoices/${created._id}`);
        setSuccessMessage('Đã tạo hóa đơn (nháp)');
      } else {
        const updated = await updateInvoice(id, payloadData);
        setInvoice(updated);
        setPaymentMethod(updated.payment_method || 'cash');
        setSuccessMessage('Đã lưu hóa đơn');
      }
    } catch (e) {
      setError(e.message || 'Không thể lưu hóa đơn');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!invoice?.status) return;
    setSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      await submitInvoice(invoice._id);
      setSuccessMessage('Đã gửi hóa đơn để duyệt');
      loadInvoice();
    } catch (e) {
      setError(e.message || 'Không thể gửi hóa đơn');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      await cancelInvoice(invoice._id);
      setSuccessMessage('Đã hủy hóa đơn');
      loadInvoice();
    } catch (e) {
      setError(e.message || 'Không thể hủy hóa đơn');
    } finally {
      setSaving(false);
    }
  };

  const currentStatus = invoice?.status || 'draft';
  // Sales staff: can only create, NOT edit/save/submit/cancel
  // Warehouse staff: can create, edit, save, submit, cancel (only on draft)
  const canEdit = isWarehouse && (isNew || (!!invoice?._id && currentStatus === 'draft'));
  const canSubmit = isWarehouse && !!invoice?._id && currentStatus === 'draft';
  const canCancel = isWarehouse && !!invoice?._id && ['draft', 'submitted'].includes(currentStatus);
  // Sales staff can only create new invoices (no edit afterward)
  const canCreate = isSales && isNew;

  if (loading) {
    return (
      <>
        <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Đang tải...</p>
      </>
    );
  }

  const totalAmount = items.reduce((s, it) => s + (it.line_total || 0), 0);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h1 className="warehouse-page-title">{isNew ? 'Tạo phiếu xuất mới' : 'Chi tiết phiếu xuất'}</h1>
          <p className="warehouse-page-subtitle">
            {isNew
              ? 'Thêm sản phẩm, lưu nháp và gửi duyệt.'
              : `Trạng thái: ${STATUS_LABEL[currentStatus] ?? currentStatus}`}
          </p>
        </div>
        <button
          type="button"
          className="warehouse-btn warehouse-btn-secondary"
          onClick={() => navigate('/warehouse/invoices')}
        >
          <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
          Quay lại
        </button>
      </div>

      {successMessage && (
        <div className="warehouse-alert warehouse-alert-success" role="status">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="warehouse-alert warehouse-alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="warehouse-card">
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {(canEdit || canCreate) && (
            <button
              type="button"
              className="warehouse-btn warehouse-btn-primary"
              onClick={handleSaveDraft}
              disabled={saving}
            >
              {isNew ? 'Lưu nháp' : 'Lưu thay đổi'}
            </button>
          )}
          {canSubmit && (
            <button
              type="button"
              className="warehouse-btn warehouse-btn-primary"
              style={{ background: '#2563eb' }}
              onClick={handleSubmit}
              disabled={saving}
            >
              Gửi duyệt
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              className="warehouse-btn warehouse-btn-secondary"
              onClick={handleCancel}
              disabled={saving}
            >
              Hủy
            </button>
          )}
        </div>

        {/* Invoice info */}
        <div style={{ marginBottom: 24, fontSize: 14, color: '#374151' }}>
          {!isNew && (
            <>
              <p style={{ margin: 0 }}>Mã hóa đơn: {invoice?._id || '—'}</p>
              <p style={{ margin: 0 }}>
                Ngày tạo: {invoice?.invoice_at ? new Date(invoice.invoice_at).toLocaleString('vi-VN') : '—'}
              </p>
              <p style={{ margin: 0 }}>
                Người tạo: {invoice?.created_by?.email ?? '—'}
              </p>
            </>
          )}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Phương thức thanh toán:</span>
            {(canEdit || isNew) ? (
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }}
              >
                <option value="cash">Tiền mặt</option>
                <option value="bank_transfer">Chuyển khoản</option>
                <option value="credit">Công nợ</option>
                <option value="card">Thẻ</option>
              </select>
            ) : (
              <span>{{ cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', credit: 'Công nợ', card: 'Thẻ' }[paymentMethod] || paymentMethod}</span>
            )}
          </div>
        </div>

        {/* Product lines */}
        <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>Danh sách sản phẩm</h3>
        <div className="warehouse-table-wrap">
          <table className="warehouse-table" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>SKU</th>
                <th style={{ textAlign: 'right' }}>Số lượng</th>
                <th style={{ textAlign: 'right' }}>Đơn giá</th>
                <th style={{ textAlign: 'right' }}>Chiết khấu</th>
                <th style={{ textAlign: 'right' }}>Thành tiền</th>
                <th>Kho</th>
                {(canEdit || canCreate) && <th>Hành động</th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={(canEdit || canCreate) ? 8 : 7} style={{ textAlign: 'center', padding: 24, color: '#6b7280' }}>
                    Chưa có dòng hàng. Nhấn "Thêm dòng" để bắt đầu.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={`${item.product_id}-${idx}`}>
                    <td>
                      {(canEdit || canCreate) ? (
                        <select
                          value={item.product_id || ''}
                          onChange={(e) => {
                            const pid = e.target.value;
                            const found = products.find((p) => p._id === pid);
                            updateLine(idx, {
                              product_id: pid,
                              name: found?.name || '',
                              sku: found?.sku || '',
                              unit_price: found?.sale_price || 0,
                            });
                          }}
                          style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }}
                        >
                          <option value="">-- Chọn sản phẩm --</option>
                          {products
                            .filter((p) => {
                              if (p._id === item.product_id) return true;
                              return !items.some((it, i) => i !== idx && it.product_id === p._id);
                            })
                            .map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name} — {p.sku}
                            </option>
                          ))}
                        </select>
                      ) : (
                        item.name || item.sku || '—'
                      )}
                    </td>
                    <td>{item.sku || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        disabled={!(canEdit || canCreate)}
                        onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 0 })}
                        style={{ width: 70, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', textAlign: 'right' }}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        min={0}
                        value={item.unit_price}
                        disabled={!(canEdit || canCreate)}
                        onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) || 0 })}
                        style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', textAlign: 'right' }}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        min={0}
                        value={item.discount}
                        disabled={!(canEdit || canCreate)}
                        onChange={(e) => updateLine(idx, { discount: Number(e.target.value) || 0 })}
                        style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', textAlign: 'right' }}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(item.line_total)}</td>
                    <td>
                      {item.in_stock != null ? (
                        <span style={{ color: item.in_stock ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                          {item.stock_qty != null ? item.stock_qty.toLocaleString('vi-VN') : '—'}
                        </span>
                      ) : '—'}
                    </td>
                    {(canEdit || canCreate) && (
                      <td>
                        <button
                          type="button"
                          className="warehouse-btn warehouse-btn-secondary"
                          style={{ padding: '4px 10px', fontSize: 13 }}
                          onClick={() => removeLine(idx)}
                        >
                          Xóa
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {(canEdit || canCreate) && (
          <button
            type="button"
            className="warehouse-btn warehouse-btn-secondary"
            onClick={handleAddLine}
            style={{ marginTop: 12 }}
          >
            <i className="fa-solid fa-plus" style={{ marginRight: 4 }} /> Thêm dòng
          </button>
        )}

        <div style={{ marginTop: 24, textAlign: 'right', fontSize: 16, fontWeight: 600 }}>
          Tổng tiền: {formatMoney(totalAmount)}
        </div>
      </div>
    </>
  );
}
