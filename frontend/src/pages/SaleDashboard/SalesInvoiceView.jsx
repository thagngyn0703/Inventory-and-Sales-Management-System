import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInvoice } from '../../services/invoicesApi';
import './SalesPOS.css'; // Optional: reuse some table styles or write inline/new styles

function formatMoney(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export default function SalesInvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        const data = await getInvoice(id);
        setInvoice(data);
      } catch (err) {
        setError(err.message || 'Không thể tải chi tiết hóa đơn.');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchInvoice();
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Đang tải dữ liệu...</div>;
  if (error) return <div style={{ padding: 40, color: 'red', textAlign: 'center' }}>{error}</div>;
  if (!invoice) return null;

  const paymentMethodMap = {
    'cash': 'Tiền mặt',
    'bank_transfer': 'Chuyển khoản',
    'credit': 'Thẻ tín dụng',
    'card': 'Quẹt thẻ',
    'debt': 'Ghi nợ'
  };

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button 
            onClick={() => navigate(-1)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#475569' }}
          >
            <i className="fa-solid fa-arrow-left" /> Quay lại
          </button>
          <h2 style={{ margin: 0, color: '#1e293b' }}>Chi tiết hóa đơn: {invoice._id}</h2>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 24 }}>
        {/* Left Side: Items Table */}
        <div style={{ background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#334155', fontSize: 16 }}>Danh sách hàng hóa</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                <th style={{ textAlign: 'left', padding: '12px 0', color: '#64748b', fontWeight: 600 }}>Tên hàng</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: '#64748b', fontWeight: 600, width: 80 }}>SL</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: '#64748b', fontWeight: 600, width: 120 }}>Đơn giá</th>
                <th style={{ textAlign: 'right', padding: '12px 0', color: '#64748b', fontWeight: 600, width: 120 }}>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items?.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '16px 0', fontWeight: 500, color: '#1e293b' }}>
                    {item.product_id?.name || 'Sản phẩm không xác định'}
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{item.product_id?.sku || ''}</div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '16px', color: '#475569' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right', padding: '16px', color: '#475569' }}>{formatMoney(item.unit_price)}</td>
                  <td style={{ textAlign: 'right', padding: '16px 0', fontWeight: 600, color: '#0f766e' }}>{formatMoney(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right Side: Order Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px', color: '#334155', fontSize: 16 }}>Thông tin đơn hàng</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Ngày tạo:</span>
                <span style={{ fontWeight: 500, color: '#1e293b' }}>{formatDate(invoice.created_at || invoice.invoice_at)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Khách hàng:</span>
                <span style={{ fontWeight: 500, color: '#1e293b' }}>{invoice.recipient_name || 'Khách lẻ'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Trạng thái:</span>
                <span style={{ 
                  fontWeight: 600, 
                  color: invoice.status === 'confirmed' ? '#10b981' : invoice.status === 'pending' ? '#92400e' : '#ef4444', 
                  background: invoice.status === 'confirmed' ? '#d1fae5' : invoice.status === 'pending' ? '#fde68a' : '#fee2e2', 
                  padding: '2px 8px', 
                  borderRadius: 4 
                }}>
                  {invoice.status === 'confirmed' ? 'Đã hoàn thành' : invoice.status === 'pending' ? 'Nợ' : 'Đã hủy'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px', color: '#334155', fontSize: 16 }}>Thanh toán</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Phương thức:</span>
                <span style={{ fontWeight: 500, color: '#1e293b' }}>{paymentMethodMap[invoice.payment_method] || invoice.payment_method}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Tổng tiền hàng ({invoice.items?.length || 0} món):</span>
                <span style={{ fontWeight: 500, color: '#1e293b' }}>{formatMoney(invoice.total_amount)}</span>
              </div>
              
              <div style={{ borderTop: '1px solid #f1f5f9', margin: '8px 0' }}></div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#334155', fontWeight: 600 }}>{invoice.status === 'pending' ? 'Khách còn nợ:' : 'Khách đã trả:'}</span>
                <span style={{ fontWeight: 700, fontSize: 20, color: invoice.status === 'pending' ? '#f59e0b' : '#0f766e' }}>{formatMoney(invoice.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
