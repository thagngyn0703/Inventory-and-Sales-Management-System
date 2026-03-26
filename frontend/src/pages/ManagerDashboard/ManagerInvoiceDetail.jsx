import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getInvoice, createInvoice, updateInvoice, cancelInvoice } from '../../services/invoicesApi';
import { getProducts } from '../../services/productsApi';
import { getCurrentUser } from '../../utils/auth';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const STATUS_LABEL = {
  confirmed: 'Đã thanh toán',
  cancelled: 'Trả hàng',
};

function formatMoney(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

export default function ManagerInvoiceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  // Treat missing / undefined IDs as "new" so the page can create a draft invoice.
  const isNew = id === 'new' || !id || id === 'undefined' || id === 'null';
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [recipientName, setRecipientName] = useState('');

  const user = getCurrentUser();
  const role = user?.role || '';
  const isManager = ['manager', 'admin'].includes(role);

  const loadProducts = useCallback(async () => {
    try {
      const { products: data = [] } = await getProducts(1, 500);
      setProducts(data);
    } catch (e) {
      // ignore
    }
  }, []);

  const loadInvoice = useCallback(async () => {
    if (!id || isNew) return;
    setLoading(true);
    setError('');
    try {
      const data = await getInvoice(id);
      setInvoice(data);
      setPaymentMethod(data.payment_method || 'cash');
      setRecipientName(data.recipient_name || '');
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

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

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

  const payload = () => {
    let currentStatus = invoice?.status;
    if (isManager && !isNew) {
      // If a dropdown or something changed invoice.status locally
      currentStatus = invoice.status;
    }

    return {
      status: currentStatus,
      payment_method: paymentMethod,
      recipient_name: recipientName,
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
    };
  };

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
        navigate(`/manager/invoices/${created._id}`);
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

  const currentStatus = invoice?.status || 'confirmed';
  const canEdit = isNew || ((!!invoice?._id) && (currentStatus === 'confirmed' || isManager));
  const canCancel = !!invoice?._id && currentStatus === 'confirmed' && role === 'admin';

  if (loading) {
    return (
      <div className="manager-page-with-sidebar">
        <ManagerSidebar />
        <div className="manager-main" style={{ padding: 24 }}>
          <p>Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-search-wrap">
            <input
              type="search"
              className="manager-search"
              placeholder="Tìm kiếm sản phẩm..."
              disabled
            />
          </div>
          <div className="manager-topbar-actions">
            <button
              type="button"
              className="manager-icon-btn"
              onClick={() => navigate('/manager/invoices')}
            >
              <i className="fa-solid fa-arrow-left" />
            </button>
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" />
              <span>Quản lý</span>
            </div>
          </div>
        </header>

        <div className="manager-content">

          {successMessage && <div className="manager-products-success">{successMessage}</div>}
          {error && <div className="manager-products-error">{error}</div>}

          <div className="manager-panel-card manager-products-card">
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <button
                  type="button"
                  className="manager-btn-primary"
                  onClick={handleSaveDraft}
                  disabled={saving || !canEdit}
                >
                  Lưu thay đổi
                </button>
                {canCancel && (
                  <button
                    type="button"
                    className="manager-btn-secondary"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    Hủy
                  </button>
                )}
              </div>

              <div style={{ marginBottom: 24 }}>
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
                  {canEdit ? (
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
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>Người nhận:</span>
                  {canEdit ? (
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Nhập tên người nhận..."
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', flex: 1, maxWidth: 300 }}
                    />
                  ) : (
                    <span>{recipientName || '—'}</span>
                  )}
                </div>
              </div>

              <div>
                <h3 style={{ margin: '24px 0 16px 0', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Danh sách sản phẩm</h3>
                
                <div className="product-items-container">
                  {items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 24px', color: '#64748b', background: '#fff', borderRadius: 12, border: '2px dashed #e2e8f0' }}>
                      <i className="fa-solid fa-box-open" style={{ fontSize: 32, marginBottom: 12, display: 'block', opacity: 0.5 }} />
                      Chưa có sản phẩm nào. Nhấn "Thêm dòng" để bắt đầu.
                    </div>
                  ) : (
                    items.map((item, idx) => (
                      <div className="product-item-row" key={`${item.product_id}-${idx}`}>
                        <div>
                          <label className="product-field-label">Sản phẩm</label>
                          {canEdit ? (
                            <select
                              className="product-select"
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
                            <input className="product-input" value={item.name || item.sku || '—'} readOnly />
                          )}
                        </div>

                        <div>
                          <label className="product-field-label">SKU</label>
                           <input className="product-input" value={item.sku || '—'} readOnly />
                        </div>

                        <div>
                          <label className="product-field-label">Số lượng</label>
                          <input
                            type="number"
                            min={1}
                            className="product-input"
                            value={item.quantity}
                            disabled={!canEdit}
                            onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 0 })}
                          />
                        </div>

                        <div>
                          <label className="product-field-label">Đơn giá</label>
                          <input
                            type="number"
                            min={0}
                            className="product-input"
                            value={item.unit_price}
                            disabled={!canEdit}
                            onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) || 0 })}
                          />
                        </div>

                        <div>
                          <label className="product-field-label">Chiết khấu</label>
                          <input
                            type="number"
                            min={0}
                            className="product-input"
                            value={item.discount}
                            disabled={!canEdit}
                            onChange={(e) => updateLine(idx, { discount: Number(e.target.value) || 0 })}
                          />
                        </div>

                        <div>
                          <label className="product-field-label">Thành tiền</label>
                          <input 
                            className="product-input" 
                            style={{ fontWeight: 700, color: 'var(--color-primary-dark)', background: '#f8fafc' }}
                            value={formatMoney(item.line_total)} 
                            readOnly 
                          />
                        </div>

                        <div>
                          <label className="product-field-label">Kho</label>
                          <div style={{ 
                            fontSize: 13, 
                            fontWeight: 600, 
                            color: item.in_stock ? '#166534' : '#b91c1c',
                            background: item.in_stock ? '#f0fdf4' : '#fef2f2',
                            padding: '8px 4px',
                            borderRadius: 8,
                            textAlign: 'center',
                            border: `1px solid ${item.in_stock ? '#bbf7d0' : '#fecaca'}`
                          }}>
                            {item.stock_qty != null ? item.stock_qty.toLocaleString('vi-VN') : '—'}
                          </div>
                        </div>

                        <div>
                          {canEdit && (
                            <>
                              <label className="product-field-label" style={{ visibility: 'hidden' }}>Xóa</label>
                              <button
                                type="button"
                                className="product-delete-btn"
                                onClick={() => removeLine(idx)}
                                title="Xóa dòng"
                              >
                                <i className="fa-solid fa-trash-can" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  {canEdit && (
                    <button type="button" className="add-line-btn" onClick={handleAddLine}>
                      <i className="fa-solid fa-plus-circle" />
                      Thêm dòng sản phẩm
                    </button>
                  )}
                </div>

                <div className="product-totals-card">
                  <div style={{ textAlign: 'right' }}>
                    <span className="total-label">Tổng cộng cộng tiền hàng</span>
                    <div className="total-value">{formatMoney(invoice?.total_amount || 0)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
