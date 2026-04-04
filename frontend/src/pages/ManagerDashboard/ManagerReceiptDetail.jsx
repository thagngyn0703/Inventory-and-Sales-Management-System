import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { getGoodsReceipt, setGoodsReceiptStatus } from '../../services/goodsReceiptsApi';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import './ManagerDashboard.css';

export default function ManagerReceiptDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [receipt, setReceipt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmType, setConfirmType] = useState(null);

    const fetchReceipt = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getGoodsReceipt(id);
            setReceipt(data);
        } catch (e) {
            setError(e.message || 'Không thể tải phiếu nhập kho');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchReceipt();
    }, [fetchReceipt]);

    const runStatusChange = async () => {
        if (!confirmType) return;
        setSubmitting(true);
        try {
            const status = confirmType === 'approve' ? 'approved' : 'rejected';
            await setGoodsReceiptStatus(id, status);
            toast(
                status === 'approved' ? 'Đã duyệt phiếu nhập thành công.' : 'Đã từ chối phiếu nhập.',
                'success'
            );
            setConfirmOpen(false);
            setConfirmType(null);
            navigate('/manager/receipts');
        } catch (e) {
            toast(e.message || 'Thao tác thất bại', 'error');
            setSubmitting(false);
            fetchReceipt();
        }
    };

    const formatDate = (d) => {
        if (!d) return '—';
        try {
            return new Date(d).toLocaleString('vi-VN');
        } catch {
            return '—';
        }
    };

    if (loading) {
        return (
            <ManagerPageFrame showNotificationBell={false}>
                <p className="py-12 text-center text-slate-600">Đang tải chi tiết phiếu nhập...</p>
            </ManagerPageFrame>
        );
    }
    if (error) {
        return (
            <ManagerPageFrame showNotificationBell={false}>
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div>
            </ManagerPageFrame>
        );
    }
    if (!receipt) return null;

    const shortId = receipt._id.substring(receipt._id.length - 6).toUpperCase();

    return (
        <ManagerPageFrame showNotificationBell={false}>
            <StaffPageShell
                eyebrow="Kho & nhập hàng"
                eyebrowIcon={ClipboardList}
                title="Chi tiết xét duyệt phiếu nhập kho"
                subtitle={`Mã phiếu: ${shortId}`}
                headerActions={
                    <Button type="button" variant="outline" className="gap-2" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4" />
                        Quay lại
                    </Button>
                }
            >
            <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08)] sm:p-6">
                <h2 style={{ fontSize: 18, marginBottom: 16, borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>Thông tin chung</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                    <div>
                        <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#6b7280' }}>Ngày tạo</p>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>{formatDate(receipt.created_at)}</p>
                    </div>
                    <div>
                        <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#6b7280' }}>Nhà cung cấp</p>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>
                            {receipt.supplier_id?.name || '—'}
                            {receipt.supplier_id?.phone && <span style={{ fontSize: 13, color: '#6b7280', display: 'block' }}>SĐT: {receipt.supplier_id.phone}</span>}
                        </p>
                    </div>
                    <div>
                        <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#6b7280' }}>Người lập phiếu</p>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>{receipt.received_by?.fullName || receipt.received_by?.email || '—'}</p>
                    </div>
                    <div>
                        <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#6b7280' }}>Lý do nhập</p>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>{receipt.reason || '—'}</p>
                    </div>
                    <div>
                        <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#6b7280' }}>Trạng thái</p>
                        <span style={{
                            padding: '4px 10px',
                            borderRadius: 9999,
                            fontSize: 13,
                            fontWeight: 500,
                            backgroundColor: 
                                receipt.status === 'pending' ? '#fef3c7' :
                                receipt.status === 'approved' ? '#d1fae5' : '#fee2e2',
                            color:
                                receipt.status === 'pending' ? '#92400e' :
                                receipt.status === 'approved' ? '#065f46' : '#991b1b',
                        }}>
                            {receipt.status === 'pending' ? 'Chờ duyệt' : 
                             receipt.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                        </span>
                    </div>
                    {receipt.status === 'approved' && receipt.approved_by && (
                        <div>
                            <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#6b7280' }}>Người duyệt</p>
                            <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>{receipt.approved_by?.fullName || receipt.approved_by?.email || '—'}</p>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ backgroundColor: 'white', padding: 20, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h2 style={{ fontSize: 18, marginBottom: 16, borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>Sản phẩm nhập kho</h2>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                        <thead style={{ backgroundColor: '#f9fafb' }}>
                            <tr>
                                <th style={{ padding: '12px', textAlign: 'left', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Sản phẩm</th>
                                <th style={{ padding: '12px', textAlign: 'left', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>SKU</th>
                                <th style={{ padding: '12px', textAlign: 'left', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Đơn vị / HSQĐ</th>
                                <th style={{ padding: '12px', textAlign: 'right', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Số lượng</th>
                                <th style={{ padding: '12px', textAlign: 'right', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Đơn giá (đ)</th>
                                <th style={{ padding: '12px', textAlign: 'right', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Thành tiền (đ)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {receipt.items?.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '12px', fontSize: 14, fontWeight: 500 }}>{item.product_id?.name || 'Sản phẩm không xác định'}</td>
                                    <td style={{ padding: '12px', fontSize: 14, color: '#4b5563' }}>{item.product_id?.sku || '—'}</td>
                                    <td style={{ padding: '12px', fontSize: 14 }}>
                                        {item.unit_name || item.product_id?.base_unit || 'Cái'} 
                                        {item.ratio > 1 && <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 6 }}>(x{item.ratio})</span>}
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 14 }}>{Number(item.quantity).toLocaleString()}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 14 }}>{Number(item.unit_cost).toLocaleString()}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>{(item.quantity * item.unit_cost).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ textAlign: 'right', fontSize: 20, fontWeight: 600, marginTop: 16 }}>
                    Tổng cộng: {Number(receipt.total_amount).toLocaleString()} đ
                </div>

                {receipt.status === 'pending' && (
                    <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
                        <button
                            disabled={submitting}
                            style={{ padding: '10px 20px', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer', backgroundColor: 'white', border: '1px solid #d1d5db', fontSize: 15, fontWeight: 500 }}
                            onClick={() => navigate(-1)}
                        >
                            Quay lại
                        </button>
                        <button
                            disabled={submitting}
                            style={{ padding: '10px 20px', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer', backgroundColor: '#ef4444', color: 'white', border: 'none', fontSize: 15, fontWeight: 500 }}
                            onClick={() => { setConfirmType('reject'); setConfirmOpen(true); }}
                        >
                            Từ chối phiếu nhập
                        </button>
                        <button
                            disabled={submitting}
                            style={{ padding: '10px 20px', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer', backgroundColor: '#10b981', color: 'white', border: 'none', fontSize: 15, fontWeight: 500 }}
                            onClick={() => { setConfirmType('approve'); setConfirmOpen(true); }}
                        >
                            Duyệt phiếu nhập (Nhập kho)
                        </button>
                    </div>
                )}
            </div>
      </StaffPageShell>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
            setConfirmOpen(open);
            if (!open) setConfirmType(null);
        }}
        title={confirmType === 'approve' ? 'Duyệt phiếu nhập kho?' : 'Từ chối phiếu nhập?'}
        description={
            confirmType === 'approve'
                ? 'Kho hàng sẽ được tăng theo số lượng và đơn giá trên phiếu.'
                : 'Phiếu sẽ được đánh dấu từ chối.'
        }
        confirmLabel={confirmType === 'approve' ? 'Duyệt nhập kho' : 'Từ chối'}
        confirmVariant={confirmType === 'reject' ? 'destructive' : 'default'}
        loading={submitting}
        onConfirm={runStatusChange}
      />
    </ManagerPageFrame>
    );
}
