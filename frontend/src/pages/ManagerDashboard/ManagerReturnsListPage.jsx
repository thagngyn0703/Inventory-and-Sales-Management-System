import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { getReturns } from '../../services/returnsApi';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';

export default function ManagerReturnsListPage() {
  const navigate = useNavigate();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getReturns({ page: 1, limit: 200 });
      setReturns(data.returns || []);
    } catch (e) {
      setError(e.message || 'Không thể tải danh sách trả hàng');
      setReturns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  const fmtDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
  };

  const fmtMoney = (n) => `${Number(n || 0).toLocaleString('vi-VN')}₫`;

  return (
    <ManagerPageFrame>
      <StaffPageShell
        eyebrow="Kho & bán hàng"
        eyebrowIcon={RotateCcw}
        eyebrowTone="rose"
        title="Danh sách trả hàng"
        subtitle="Mỗi dòng là một phiếu trả hàng, liên kết ngược về hóa đơn bán gốc."
      >
        {error && <div className="manager-products-error">{error}</div>}
        <div className="manager-panel-card manager-products-card rounded-2xl border border-slate-200/80 shadow-sm">
          {loading ? (
            <p className="manager-products-loading">Đang tải...</p>
          ) : returns.length === 0 ? (
            <p className="manager-products-loading">Chưa có phiếu trả hàng nào.</p>
          ) : (
            <div className="manager-products-table-wrap">
              <table className="manager-products-table">
                <thead>
                  <tr>
                    <th>Ngày trả</th>
                    <th>Mã phiếu trả</th>
                    <th>Hóa đơn gốc</th>
                    <th>Lý do</th>
                    <th>Mặt hàng</th>
                    <th style={{ textAlign: 'right' }}>Tổng hoàn</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((rt) => (
                    <tr key={rt._id}>
                      <td>{fmtDate(rt.return_at || rt.created_at)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{String(rt._id || '').slice(-10).toUpperCase()}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{rt.invoice_id?._id || '—'}</td>
                      <td>{rt.reason || 'Khách trả hàng'}</td>
                      <td>{(rt.items || []).length}</td>
                      <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{fmtMoney(rt.total_amount)}</td>
                      <td>
                        <button
                          type="button"
                          className="manager-btn-secondary"
                          style={{ padding: '6px 12px', fontSize: 13 }}
                          onClick={() => navigate(`/manager/returns/${rt._id}`)}
                        >
                          Xem phiếu trả
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
