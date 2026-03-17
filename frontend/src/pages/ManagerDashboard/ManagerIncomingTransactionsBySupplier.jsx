import React, { useState, useEffect, useCallback } from 'react';
import ManagerSidebar from './ManagerSidebar';
import { getSuppliers } from '../../services/suppliersApi';
import { getPurchaseOrders, getGoodsReceipts } from '../../services/incomingTransactionsApi';
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

export default function ManagerIncomingTransactionsBySupplier() {
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
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-search-wrap">
            <select
              className="manager-search"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              style={{ paddingLeft: 14, maxWidth: 320 }}
            >
              <option value="">Tất cả nhà cung cấp</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="manager-topbar-actions">
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" />
              <span>Quản lý</span>
            </div>
          </div>
        </header>

        <div className="manager-content">
          <div className="manager-products-header">
            <div>
              <h1 className="manager-page-title">Giao dịch đến theo nhà cung cấp</h1>
              <p className="manager-page-subtitle">
                Đơn mua hàng và phiếu nhập kho theo nhà cung cấp
              </p>
            </div>
          </div>

          {error && <div className="manager-products-error">{error}</div>}

          {loading ? (
            <p className="manager-products-loading">Đang tải...</p>
          ) : (
            <>
              <div className="manager-panel-card manager-products-card" style={{ marginBottom: 24 }}>
                <h2 className="manager-page-title" style={{ fontSize: 18, marginBottom: 12 }}>
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
                            <td>{PO_STATUS_LABEL[po.status] ?? po.status}</td>
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

              <div className="manager-panel-card manager-products-card">
                <h2 className="manager-page-title" style={{ fontSize: 18, marginBottom: 12 }}>
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
                      </tr>
                    </thead>
                    <tbody>
                      {goodsReceipts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="manager-products-empty">
                            Không có phiếu nhập kho nào.
                          </td>
                        </tr>
                      ) : (
                        goodsReceipts.map((gr) => (
                          <tr key={gr._id}>
                            <td>{gr._id?.slice(-8)}</td>
                            <td>{gr.supplier_id?.name ?? '—'}</td>
                            <td>{formatDate(gr.received_at)}</td>
                            <td>{GR_STATUS_LABEL[gr.status] ?? gr.status}</td>
                            <td>{formatMoney(gr.total_amount)}</td>
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
        </div>
      </div>
    </div>
  );
}
