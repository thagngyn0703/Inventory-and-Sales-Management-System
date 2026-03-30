import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getGoodsReceipts } from '../../services/goodsReceiptsApi';

const STATUS_LABEL = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

export default function WarehouseGoodsReceiptList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [receipts, setReceipts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortByPrice, setSortByPrice] = useState(null); // 'asc' or 'desc'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGoodsReceipts(statusFilter);
      setReceipts(data || []);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách');
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const stateMessage = location.state?.success;
    if (stateMessage) {
      setSuccessMessage(stateMessage);
      setError('');
      window.history.replaceState({}, document.title, location.pathname + location.search);
    }
  }, [location.state]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
  };

  const handleSortPrice = () => {
    if (sortByPrice === null) setSortByPrice('asc');
    else if (sortByPrice === 'asc') setSortByPrice('desc');
    else setSortByPrice(null);
  };

  const filteredAndSortedReceipts = React.useMemo(() => {
    let result = receipts.filter(r => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const code = r._id.substring(r._id.length - 6).toLowerCase();
      const supplier = (r.supplier_id?.name || '').toLowerCase();
      const creator = (r.received_by?.fullName || '').toLowerCase();
      return code.includes(term) || supplier.includes(term) || creator.includes(term);
    });

    result.sort((a, b) => {
      if (sortByPrice === 'asc') return Number(a.total_amount) - Number(b.total_amount);
      if (sortByPrice === 'desc') return Number(b.total_amount) - Number(a.total_amount);
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return result;
  }, [receipts, searchTerm, sortByPrice]);

  return (
    <>
      <h1 className="warehouse-page-title">Danh sách phiếu nhập kho</h1>
      <p className="warehouse-page-subtitle">Xem và quản lý các phiếu nhập kho đã tạo.</p>

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
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 250 }}>
            <div style={{ position: 'relative' }}>
              <i className="fa-solid fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}></i>
              <input
                type="text"
                placeholder="Mã phiếu, NCC, Người tạo..."
                style={{ width: '100%', padding: '8px 12px 8px 36px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 14, color: '#374151', whiteSpace: 'nowrap' }}>Trạng thái:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                backgroundColor: 'white'
              }}
            >
              <option value="">Tất cả</option>
              <option value="draft">Nháp</option>
              <option value="pending">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Từ chối</option>
            </select>
          </div>

          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 14, color: '#374151', whiteSpace: 'nowrap' }}>Sắp xếp giá trị:</label>
            <button
                type="button"
                onClick={handleSortPrice}
                style={{
                    height: 38,
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#111827',
                    fontSize: 14
                }}
                title="Nhấn để đổi chiều sắp xếp"
            >
                <span>
                    {sortByPrice === 'asc' ? 'Từ thấp đến cao' : sortByPrice === 'desc' ? 'Từ cao xuống thấp' : 'Mặc định'}
                </span>
                <i className={`fa-solid ${sortByPrice === 'asc' ? 'fa-arrow-up-1-9' : sortByPrice === 'desc' ? 'fa-arrow-down-9-1' : 'fa-sort'}`} style={{ color: '#6b7280' }}></i>
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Đang tải...</p>
        ) : receipts.length === 0 ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
            Chưa có phiếu nhập kho nào.{' '}
            <button
              type="button"
              className="warehouse-btn warehouse-btn-primary"
              style={{ marginLeft: 8 }}
              onClick={() => navigate('/warehouse/receipts/new')}
            >
              Tạo phiếu nhập kho
            </button>
          </p>
        ) : (
          <div className="warehouse-table-wrap">
            <table className="warehouse-table">
              <thead>
                <tr>
                  <th>Mã phiếu</th>
                  <th>Thời gian nhập</th>
                  <th>Nhà cung cấp</th>
                  <th>Người tạo</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedReceipts.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <span 
                          style={{ color: '#059669', cursor: 'pointer', fontWeight: 500 }}
                          onClick={() => navigate(`/warehouse/receipts/${r._id}`)}
                      >
                          {r._id.substring(r._id.length - 6).toUpperCase()}
                      </span>
                    </td>
                    <td>{formatDate(r.created_at)}</td>
                    <td>{r.supplier_id?.name ?? '—'}</td>
                    <td>{r.received_by?.fullName ?? r.received_by?.email ?? '—'}</td>
                    <td>{r.total_amount?.toLocaleString() || 0} đ</td>
                    <td>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 9999,
                        fontSize: 12,
                        fontWeight: 500,
                        backgroundColor: 
                          r.status === 'pending' ? '#fef3c7' :
                          r.status === 'approved' ? '#d1fae5' : 
                          r.status === 'rejected' ? '#fee2e2' : '#f3f4f6',
                        color:
                          r.status === 'pending' ? '#92400e' :
                          r.status === 'approved' ? '#065f46' : 
                          r.status === 'rejected' ? '#991b1b' : '#374151',
                      }}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="warehouse-btn warehouse-btn-secondary"
                        style={{ padding: '6px 12px', fontSize: 13 }}
                        onClick={() => navigate(`/warehouse/receipts/${r._id}`)}
                      >
                        Xem
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
