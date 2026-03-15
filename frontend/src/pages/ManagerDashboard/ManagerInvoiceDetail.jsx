import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getInvoice, createInvoice, updateInvoice, submitInvoice, approveInvoice, rejectInvoice, cancelInvoice } from '../../services/invoicesApi';
import { getProducts } from '../../services/productsApi';
import { getCurrentUser } from '../../utils/auth';
import './ManagerDashboard.css';
import './ManagerProducts.css';

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

  const handleApprove = async () => {
    setSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      await approveInvoice(invoice._id);
      setSuccessMessage('Đã duyệt hóa đơn và cập nhật tồn kho');
      loadInvoice();
      
      // Navigate to the list or reload
      // navigate('/manager/invoices');
    } catch (e) {
      setError(e.message || 'Không thể duyệt hóa đơn');
    } finally {
      setSaving(false);
    }
  };

  const handleDirectApprove = async () => {
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
      let currentInvoice = invoice;
      // 1. Save or Update Draft first
      if (isNew) {
        currentInvoice = await createInvoice(payloadData);
        setInvoice(currentInvoice);
      } else {
        currentInvoice = await updateInvoice(id, payloadData);
        setInvoice(currentInvoice);
        setPaymentMethod(currentInvoice.payment_method || 'cash');
      }
      
      // 2. Submit it
      await submitInvoice(currentInvoice._id);
      
      // 3. Approve it immediately
      await approveInvoice(currentInvoice._id);
      
      setSuccessMessage('Đã tạo và duyệt hóa đơn thành công!');
      if (isNew) {
        navigate(`/manager/invoices/${currentInvoice._id}`);
      } else {
        loadInvoice();
      }
    } catch (e) {
      setError(e.message || 'Lỗi trong quá trình xử lý hóa đơn');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    setSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      await rejectInvoice(invoice._id);
      setSuccessMessage('Đã từ chối hóa đơn');
      loadInvoice();
    } catch (e) {
      setError(e.message || 'Không thể từ chối hóa đơn');
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
  const canEdit = isNew || ((!!invoice?._id) && (currentStatus === 'draft' || isManager));
  const canDirectApprove = isNew || (!!invoice?._id && currentStatus === 'draft');
  const canSubmit = !!invoice?._id && currentStatus === 'draft' && !isManager; 
  const canCancel = !!invoice?._id && ['draft', 'submitted'].includes(currentStatus);
  const canApprove = !!invoice?._id && isManager && currentStatus === 'submitted';
  const canReject = !!invoice?._id && isManager && currentStatus === 'submitted';

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
                {canDirectApprove && isManager && (
                  <button
                    type="button"
                    className="manager-btn-primary"
                    style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                    onClick={handleDirectApprove}
                    disabled={saving}
                  >
                    Duyệt ngay
                  </button>
                )}
                {canSubmit && (
                  <button
                    type="button"
                    className="manager-btn-secondary"
                    onClick={handleSubmit}
                    disabled={saving}
                  >
                    Gửi duyệt
                  </button>
                )}
                {canApprove && (
                  <button
                    type="button"
                    className="manager-btn-primary"
                    onClick={handleApprove}
                    disabled={saving}
                  >
                    Duyệt
                  </button>
                )}
                {canReject && (
                  <button
                    type="button"
                    className="manager-btn-secondary"
                    onClick={handleReject}
                    disabled={saving}
                  >
                    Từ chối
                  </button>
                )}
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
              </div>

              <div>
                <h3 style={{ margin: '0 0 12px 0' }}>Danh sách sản phẩm</h3>
                <div className="manager-products-table-wrap">
                  <table className="manager-products-table" style={{ minWidth: 900 }}>
                    <thead>
                      <tr>
                        <th>Sản phẩm</th>
                        <th>SKU</th>
                        <th style={{ textAlign: 'right' }}>Số lượng</th>
                        <th style={{ textAlign: 'right' }}>Đơn giá</th>
                        <th style={{ textAlign: 'right' }}>Chiết khấu</th>
                        <th style={{ textAlign: 'right' }}>Thành tiền</th>
                        <th>Kho</th>
                        {canEdit && <th>Hành động</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={canEdit ? 8 : 7} className="manager-products-empty">
                            <div style={{ padding: 16, textAlign: 'center' }}>
                              <p style={{ margin: 0, fontWeight: 600 }}>Chưa có dòng hàng.</p>
                              <p style={{ margin: '4px 0 0', color: '#6b7280' }}>
                                Nhấn "Thêm dòng" để bắt đầu tạo phiếu xuất.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        items.map((item, idx) => (
                          <tr key={`${item.product_id}-${idx}`}>
                            <td>
                              {canEdit ? (
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
                                >
                                  <option value="">-- Chọn sản phẩm --</option>
                                  {products
                                    .filter((p) => {
                                      // Allow the currently selected product for this line
                                      if (p._id === item.product_id) return true;
                                      // Hide products already used in other lines
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
                                disabled={!canEdit}
                                onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 0 })}
                                style={{ width: 80, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number"
                                min={0}
                                value={item.unit_price}
                                disabled={!canEdit}
                                onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) || 0 })}
                                style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number"
                                min={0}
                                value={item.discount}
                                disabled={!canEdit}
                                onChange={(e) => updateLine(idx, { discount: Number(e.target.value) || 0 })}
                                style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(item.line_total)}</td>
                            <td>
                              {item.in_stock != null ? (
                                <span style={{ color: item.in_stock ? '#166534' : '#b91c1c' }}>
                                  {item.stock_qty != null ? item.stock_qty.toLocaleString('vi-VN') : '—'}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            {canEdit && (
                              <td>
                                <button
                                  type="button"
                                  className="manager-btn-secondary"
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

                {canEdit && (
                  <button
                    type="button"
                    className="manager-btn-secondary"
                    onClick={handleAddLine}
                    style={{ marginTop: 12 }}
                  >
                    <i className="fa-solid fa-plus" /> Thêm dòng
                  </button>
                )}
              </div>

              <div style={{ marginTop: 24, textAlign: 'right', fontSize: 16, fontWeight: 600 }}>
                Tổng tiền: {formatMoney(invoice?.total_amount || 0)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
