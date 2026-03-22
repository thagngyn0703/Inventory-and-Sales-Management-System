import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProducts } from '../../services/productsApi';
import { getSuppliers } from '../../services/suppliersApi';
import { createGoodsReceipt } from '../../services/goodsReceiptsApi';
import WarehouseProductCreateModal from './WarehouseProductCreateModal';

export default function WarehouseGoodsReceiptCreate() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [reason, setReason] = useState('');
  
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [searching, setSearching] = useState(false);
  
  const [items, setItems] = useState([]); // { product, quantity, unit_cost }
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [showProductModal, setShowProductModal] = useState(false);

  // Fetch suppliers on mount
  useEffect(() => {
    getSuppliers()
      .then(setSuppliers)
      .catch((e) => setError('Không tải được nhà cung cấp: ' + e.message));
  }, []);

  const handleSearchProducts = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const data = await getProducts(1, 20, search);
      setProducts(data.products || []);
    } catch (e) {
      setError(e.message || 'Lỗi tìm kiếm sản phẩm');
    } finally {
      setSearching(false);
    }
  }, [search]);

  const handleAddProduct = (product) => {
    if (items.find((item) => item.product._id === product._id)) {
        return; // already added
    }
    const defaultUnit = product.selling_units && product.selling_units.length > 0
      ? product.selling_units[0]
      : { name: product.base_unit || 'Cái', ratio: 1, sale_price: product.sale_price };
    
    setItems((prev) => [...prev, { 
      product, 
      quantity: 1, 
      unit_cost: product.cost_price || 0,
      unit_name: defaultUnit.name,
      ratio: defaultUnit.ratio
    }]);
  };

  const handleRemoveItem = (productId) => {
    setItems((prev) => prev.filter((item) => item.product._id !== productId));
  };

  const handleItemChange = (productId, field, value) => {
    setItems((prev) => prev.map((item) => {
      if (item.product._id === productId) {
        if (field === 'unit') {
            const selectedUnit = item.product.selling_units.find(u => u.name === value);
            return {
                ...item,
                unit_name: selectedUnit ? selectedUnit.name : value,
                ratio: selectedUnit ? selectedUnit.ratio : 1
            };
        }
        return { ...item, [field]: Number(value) >= 0 ? Number(value) : 0 };
      }
      return item;
    }));
  };

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);

  const handleSubmit = async (status) => {
    if (!selectedSupplierId) {
      setError('Vui lòng chọn nhà cung cấp');
      return;
    }
    if (items.length === 0) {
      setError('Vui lòng thêm ít nhất một sản phẩm');
      return;
    }
    
    // validate items
    const invalidItems = items.filter(item => item.quantity <= 0);
    if (invalidItems.length > 0) {
        setError('Số lượng sản phẩm nhập phải lớn hơn 0');
        return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payloadItems = items.map((item) => ({
        product_id: item.product._id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        unit_name: item.unit_name,
        ratio: item.ratio,
      }));

      await createGoodsReceipt({
        supplier_id: selectedSupplierId,
        reason,
        status,
        items: payloadItems,
        total_amount: totalAmount,
      });

      navigate('/warehouse/receipts', { state: { success: 'Đã tạo phiếu nhập kho thành công' } });
    } catch (err) {
      setError(err.message || 'Không thể tạo phiếu nhập kho');
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="warehouse-page-title">Nhập hàng vào kho</h1>
      <p className="warehouse-page-subtitle">Tạo phiếu nhập kho để ghi nhận hàng hóa nhận từ nhà cung cấp theo luồng nghiệp vụ.</p>

      {error && (
        <div className="warehouse-alert warehouse-alert-error" role="alert">
          {error}
        </div>
      )}
      
      {successMsg && (
        <div className="warehouse-alert warehouse-alert-success" role="alert">
          {successMsg}
        </div>
      )}

      <div className="warehouse-card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Thông tin chung</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Nhà cung cấp (*)</label>
            <select
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6 }}
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
            >
              <option value="">-- Chọn nhà cung cấp --</option>
              {suppliers.map(s => (
                <option key={s._id} value={s._id}>{s.name} - {s.phone}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Lý do nhập hàng</label>
            <input
              type="text"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6 }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Nhập lô hàng tháng 3..."
            />
          </div>
        </div>
      </div>

      <div className="warehouse-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>Thêm sản phẩm</h2>
            <button
              type="button"
              className="warehouse-btn warehouse-btn-secondary"
              onClick={() => setShowProductModal(true)}
            >
              + Đăng ký thông tin sản phẩm mới
            </button>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <input
            type="search"
            placeholder="Tìm sản phẩm theo tên, SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchProducts()}
          />
          <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={handleSearchProducts}>
            {searching ? 'Đang tìm...' : 'Tìm kiếm'}
          </button>
        </div>

        {products.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, maxHeight: 200, overflowY: 'auto' }}>
            {products.map(p => (
              <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #f3f4f6' }}>
                <div>
                  <strong>{p.name}</strong> <span style={{ color: '#6b7280', fontSize: 13 }}>({p.sku})</span>
                </div>
                <button
                  type="button"
                  className="warehouse-btn warehouse-btn-secondary"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => handleAddProduct(p)}
                >
                  Thêm
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="warehouse-card">
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Danh sách sản phẩm nhập</h2>
        {items.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Chưa có sản phẩm nào được chọn.</p>
        ) : (
          <div className="warehouse-table-wrap">
            <table className="warehouse-table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Số lượng</th>
                  <th>Đơn giá nhập (đ)</th>
                  <th>Thành tiền (đ)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.product._id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{item.product.name}</div>
                      <div style={{ marginTop: 4 }}>
                        <select
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                          value={item.unit_name}
                          onChange={(e) => handleItemChange(item.product._id, 'unit', e.target.value)}
                        >
                          {(item.product.selling_units && item.product.selling_units.length > 0) ? (
                            item.product.selling_units.map(u => (
                              <option key={u.name} value={u.name}>{u.name} (x{u.ratio})</option>
                            ))
                          ) : (
                            <option value={item.product.base_unit || 'Cái'}>{item.product.base_unit || 'Cái'} (x1)</option>
                          )}
                        </select>
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        style={{ width: 80, padding: 6, borderRadius: 4, border: '1px solid #ccc' }}
                        value={item.quantity}
                        onChange={(e) => handleItemChange(item.product._id, 'quantity', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        style={{ width: 120, padding: 6, borderRadius: 4, border: '1px solid #ccc' }}
                        value={item.unit_cost}
                        onChange={(e) => handleItemChange(item.product._id, 'unit_cost', e.target.value)}
                      />
                    </td>
                    <td>{(item.quantity * item.unit_cost).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}
                        onClick={() => handleRemoveItem(item.product._id)}
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', marginTop: 16, fontSize: 18, fontWeight: 'bold' }}>
              Tổng cộng: {totalAmount.toLocaleString()} đ
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="warehouse-btn warehouse-btn-secondary"
            onClick={() => navigate('/warehouse/receipts')}
          >
            Hủy
          </button>
          <button
            type="button"
            className="warehouse-btn warehouse-btn-secondary"
            onClick={() => handleSubmit('draft')}
            disabled={submitting}
          >
            {submitting ? 'Đang xử lý...' : 'Lưu nháp'}
          </button>
          <button
            type="button"
            className="warehouse-btn warehouse-btn-primary"
            onClick={() => handleSubmit('pending')}
            disabled={submitting}
          >
            {submitting ? 'Đang xử lý...' : 'Gửi yêu cầu duyệt'}
          </button>
        </div>
      </div>

      {showProductModal && (
        <WarehouseProductCreateModal
          onClose={() => setShowProductModal(false)}
          onSuccess={(newRequest) => {
            setShowProductModal(false);
            setSuccessMsg('Đã gửi yêu cầu tạo sản phẩm thành công. Vui lòng đợi quản lý phê duyệt.');
            setTimeout(() => setSuccessMsg(''), 5000);
          }}
        />
      )}
    </>
  );
}
