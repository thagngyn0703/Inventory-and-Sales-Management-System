import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { getGoodsReceipt, setGoodsReceiptStatus, updateGoodsReceiptItems } from '../../services/goodsReceiptsApi';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { ArrowLeft, ClipboardList, CreditCard } from 'lucide-react';
import './ManagerDashboard.css';

const PAYMENT_TYPE_LABEL = {
    cash: 'Trả đủ ngay',
    partial: 'Trả một phần',
    credit: 'Ghi nợ (trả sau)',
};

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
    const [rejectionReason, setRejectionReason] = useState('');
    // Thanh toán NCC khi duyệt
    const [paymentType, setPaymentType] = useState('credit');
    const [amountPaid, setAmountPaid] = useState('');
    const [dueDatePayable, setDueDatePayable] = useState('');
    const [editItems, setEditItems] = useState([]);

    const fetchReceipt = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getGoodsReceipt(id);
            setReceipt(data);
            const initialEdit = (data?.items || []).map((it) => ({
                product_id: it.product_id?._id || it.product_id,
                quantity: Number(it.quantity) || 0,
                unit_cost: Number(it.unit_cost) || 0,
                sale_price:
                    (Array.isArray(it.product_id?.selling_units)
                    && it.product_id?.selling_units?.find((u) => u.name === it.unit_name)?.sale_price != null)
                        ? Number(it.product_id.selling_units.find((u) => u.name === it.unit_name).sale_price)
                        : Number(it.product_id?.sale_price) || 0,
                price_gap_note: it.price_gap_note || '',
            }));
            setEditItems(initialEdit);
        } catch (e) {
            setError(e.message || 'Không thể tải phiếu nhập kho');
        } finally {
            setLoading(false);
        }
    }, [id]);

    const handleEditItemChange = (productId, field, value) => {
        setEditItems((prev) =>
            prev.map((it) => {
                if (String(it.product_id) !== String(productId)) return it;
                if (field === 'price_gap_note') return { ...it, price_gap_note: value };
                const n = Number(value);
                return { ...it, [field]: Number.isFinite(n) && n >= 0 ? n : 0 };
            })
        );
    };

    const handleSaveManagerAdjustments = async () => {
        if (!receipt || receipt.status !== 'pending') return;
        setSubmitting(true);
        try {
            const payload = editItems.map((it) => ({
                product_id: it.product_id,
                quantity: it.quantity,
                unit_cost: it.unit_cost,
                sale_price: it.sale_price,
                price_gap_note: it.price_gap_note,
            }));
            const updated = await updateGoodsReceiptItems(receipt._id, payload);
            setReceipt(updated);
            toast('Đã cập nhật phiếu nhập, đồng thời cập nhật giá gốc và giá bán trên sản phẩm.', 'success');
        } catch (e) {
            toast(e.message || 'Không thể cập nhật phiếu nhập', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        fetchReceipt();
    }, [fetchReceipt]);

    const runStatusChange = async () => {
        if (!confirmType) return;
        if (confirmType === 'reject' && !rejectionReason.trim()) {
            toast('Vui lòng nhập lý do từ chối', 'error');
            return;
        }
        if (confirmType === 'approve' && paymentType === 'partial') {
            const v = Number(amountPaid);
            if (!v || v <= 0) { toast('Vui lòng nhập số tiền đã trả', 'error'); return; }
            if (v >= Number(receipt?.total_amount)) { toast('Nếu trả đủ, hãy chọn "Trả đủ ngay"', 'error'); return; }
        }
        setSubmitting(true);
        try {
            const status = confirmType === 'approve' ? 'approved' : 'rejected';
            const extra = confirmType === 'approve' ? {
                payment_type: paymentType,
                amount_paid_at_approval: paymentType === 'cash' ? Number(receipt?.total_amount) : (paymentType === 'partial' ? Number(amountPaid) : 0),
                due_date_payable: (paymentType === 'credit' || paymentType === 'partial') && dueDatePayable ? dueDatePayable : undefined,
            } : {};
            await setGoodsReceiptStatus(id, status, rejectionReason.trim() || undefined, extra);
            toast(
                status === 'approved' ? 'Đã duyệt phiếu nhập thành công.' : 'Đã từ chối phiếu nhập.',
                'success'
            );
            setConfirmOpen(false);
            setConfirmType(null);
            setRejectionReason('');
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
    const sp = receipt.supplier_payable;
    const payTotal = Number(receipt.total_amount) || 0;
    const paidAtApproval = Number(receipt.amount_paid_at_approval) || 0;
    const paidTotalNcc =
        sp != null ? Number(sp.paid_amount) || 0 : (receipt.payment_type === 'cash' ? payTotal : paidAtApproval);
    const remainingNcc =
        sp != null ? Number(sp.remaining_amount) || 0 : Math.max(0, payTotal - paidAtApproval);
    const dueStr = receipt.due_date_payable || sp?.due_date;
    const showSupplierPaySection = receipt.status === 'approved' && (receipt.payment_type || sp);
    const editByProductId = new Map(editItems.map((it) => [String(it.product_id), it]));

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
                    {(receipt.status === 'approved' || receipt.status === 'rejected') && receipt.approved_by && (
                        <div>
                            <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#6b7280' }}>
                                {receipt.status === 'approved' ? 'Người duyệt' : 'Người từ chối'}
                            </p>
                            <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>{receipt.approved_by?.fullName || receipt.approved_by?.email || '—'}</p>
                        </div>
                    )}
                    {receipt.status === 'rejected' && receipt.rejection_reason && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#6b7280' }}>Lý do từ chối</p>
                            <p style={{ margin: 0, fontWeight: 500, fontSize: 15, color: '#991b1b' }}>{receipt.rejection_reason}</p>
                        </div>
                    )}
                </div>
            </div>

            {showSupplierPaySection && (
                <div className="mb-6 rounded-2xl border border-sky-200/80 bg-sky-50/60 p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <CreditCard className="h-5 w-5 text-sky-600" />
                        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#0369a1' }}>Thanh toán nhà cung cấp</h2>
                    </div>
                    {sp && (
                        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#0369a1', lineHeight: 1.45 }}>
                            Số liệu <strong>tổng đã trả / còn nợ</strong> lấy từ sổ công nợ NCC (cập nhật khi ghi nhận thanh toán sau duyệt).
                        </p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                        {receipt.payment_type && (
                        <div>
                            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Hình thức lúc duyệt</p>
                            <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>
                                {PAYMENT_TYPE_LABEL[receipt.payment_type] ?? receipt.payment_type}
                            </p>
                        </div>
                        )}
                        <div>
                            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Tổng phiếu</p>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{payTotal.toLocaleString('vi-VN')} đ</p>
                        </div>
                        {(receipt.payment_type !== 'cash' || sp) && (
                            <>
                                <div>
                                    <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Tổng đã trả NCC</p>
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#059669' }}>
                                        {paidTotalNcc.toLocaleString('vi-VN')} đ
                                    </p>
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Còn nợ</p>
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: remainingNcc > 0 ? '#dc2626' : '#059669' }}>
                                        {remainingNcc.toLocaleString('vi-VN')} đ
                                        {remainingNcc <= 0 && ' (đã trả đủ)'}
                                    </p>
                                </div>
                                {receipt.payment_type && receipt.payment_type !== 'cash' && paidAtApproval > 0 && paidAtApproval !== paidTotalNcc && (
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                                            Trả khi duyệt phiếu: <strong>{paidAtApproval.toLocaleString('vi-VN')} đ</strong>
                                            {sp ? ' — các khoản trả sau được cộng vào “Tổng đã trả NCC”.' : null}
                                        </p>
                                    </div>
                                )}
                                {dueStr && (
                                    <div>
                                        <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Hạn thanh toán</p>
                                        <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>
                                            {new Date(dueStr).toLocaleDateString('vi-VN')}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                        <div>
                            <Link to="/manager/supplier-payables" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#0369a1', fontWeight: 500, textDecoration: 'none', marginTop: 4 }}>
                                Xem công nợ NCC →
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ backgroundColor: 'white', padding: 20, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h2 style={{ fontSize: 18, marginBottom: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>Sản phẩm nhập kho</h2>
                {receipt.status === 'pending' && (
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                        Bấm <strong>Lưu điều chỉnh giá</strong> để ghi đơn giá nhập đúng theo hóa đơn NCC và cập nhật <strong>giá gốc</strong> / <strong>giá bán</strong> trên từng sản phẩm trước khi duyệt nhập kho.
                    </p>
                )}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                        <thead style={{ backgroundColor: '#f9fafb' }}>
                            <tr>
                                <th style={{ padding: '12px', textAlign: 'left', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Sản phẩm</th>
                                <th style={{ padding: '12px', textAlign: 'left', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>SKU</th>
                                <th style={{ padding: '12px', textAlign: 'left', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Đơn vị / HSQĐ</th>
                                <th style={{ padding: '12px', textAlign: 'right', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Số lượng</th>
                                <th style={{ padding: '12px', textAlign: 'right', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }} title="Giá gốc × HSQĐ mà staff thấy lúc tạo phiếu">
                                    HS lúc lập (đ)
                                </th>
                                <th style={{ padding: '12px', textAlign: 'right', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Đơn giá nhập (đ)</th>
                                {receipt.status === 'pending' && (
                                    <th style={{ padding: '12px', textAlign: 'right', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                                        Giá bán (đ)
                                    </th>
                                )}
                                <th style={{ padding: '12px', textAlign: 'right', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Thành tiền (đ)</th>
                                <th style={{ padding: '12px', textAlign: 'left', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                                    Ghi chú chênh lệch
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {receipt.items?.map((item, idx) => (
                                (() => {
                                    const pid = item.product_id?._id || item.product_id;
                                    const editItem = editByProductId.get(String(pid));
                                    const displayQty = editItem ? Number(editItem.quantity) : Number(item.quantity);
                                    const displayUnitCost = editItem ? Number(editItem.unit_cost) : Number(item.unit_cost);
                                    const displaySalePrice = editItem
                                        ? Number(editItem.sale_price)
                                        : Number(item.product_id?.sale_price) || 0;
                                    const displayNote = editItem?.price_gap_note ?? item.price_gap_note ?? '';
                                    const staffSnapshot =
                                        item.system_unit_cost != null
                                            ? Number(item.system_unit_cost)
                                            : (item.system_sale_price != null ? Number(item.system_sale_price) : null);
                                    return (
                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '12px', fontSize: 14, fontWeight: 500 }}>{item.product_id?.name || 'Sản phẩm không xác định'}</td>
                                    <td style={{ padding: '12px', fontSize: 14, color: '#4b5563' }}>{item.product_id?.sku || '—'}</td>
                                    <td style={{ padding: '12px', fontSize: 14 }}>
                                        {item.unit_name || item.product_id?.base_unit || 'Cái'} 
                                        {item.ratio > 1 && <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 6 }}>(x{item.ratio})</span>}
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 14 }}>{Number(displayQty).toLocaleString()}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 14, color: '#64748b' }}>
                                        {staffSnapshot != null && !Number.isNaN(staffSnapshot)
                                            ? staffSnapshot.toLocaleString('vi-VN')
                                            : '—'}
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 14 }}>
                                        {receipt.status === 'pending' ? (
                                            <input
                                                type="number"
                                                min="0"
                                                value={displayUnitCost}
                                                onChange={(e) => handleEditItemChange(pid, 'unit_cost', e.target.value)}
                                                style={{ width: 120, textAlign: 'right', padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db' }}
                                            />
                                        ) : (
                                            Number(displayUnitCost).toLocaleString()
                                        )}
                                    </td>
                                    {receipt.status === 'pending' && (
                                        <td style={{ padding: '12px', textAlign: 'right', fontSize: 14 }}>
                                            <input
                                                type="number"
                                                min="0"
                                                value={displaySalePrice}
                                                onChange={(e) => handleEditItemChange(pid, 'sale_price', e.target.value)}
                                                style={{ width: 120, textAlign: 'right', padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db' }}
                                            />
                                        </td>
                                    )}
                                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>
                                        {(displayQty * displayUnitCost).toLocaleString()}
                                    </td>
                                    <td style={{ padding: '12px', fontSize: 13, color: '#7c2d12', minWidth: 220 }}>
                                        {receipt.status === 'pending' ? (
                                            <input
                                                type="text"
                                                value={displayNote}
                                                onChange={(e) => handleEditItemChange(pid, 'price_gap_note', e.target.value)}
                                                placeholder="Ghi chú chênh lệch giá"
                                                style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #fed7aa', background: '#fff7ed' }}
                                            />
                                        ) : (
                                            displayNote || '—'
                                        )}
                                    </td>
                                </tr>
                                    );
                                })()
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ textAlign: 'right', fontSize: 20, fontWeight: 600, marginTop: 16 }}>
                    Tổng cộng: {Number(
                        receipt.status === 'pending'
                            ? editItems.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0), 0)
                            : receipt.total_amount
                    ).toLocaleString()} đ
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
                            style={{ padding: '10px 20px', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer', backgroundColor: '#0ea5e9', color: 'white', border: 'none', fontSize: 15, fontWeight: 500 }}
                            onClick={handleSaveManagerAdjustments}
                        >
                            Lưu điều chỉnh giá
                        </button>
                        <button
                            disabled={submitting}
                            style={{ padding: '10px 20px', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer', backgroundColor: '#ef4444', color: 'white', border: 'none', fontSize: 15, fontWeight: 500 }}
                            onClick={() => { setRejectionReason(''); setConfirmType('reject'); setConfirmOpen(true); }}
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
            if (!open) { setConfirmType(null); setRejectionReason(''); }
        }}
        title={confirmType === 'approve' ? 'Duyệt phiếu nhập kho' : 'Từ chối phiếu nhập?'}
        description={
            confirmType === 'approve'
                ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>
                            Kho hàng sẽ được tăng. Vui lòng chọn hình thức thanh toán nhà cung cấp.
                        </p>
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                                Thanh toán nhà cung cấp <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {[
                                    { value: 'cash', label: 'Trả đủ ngay', desc: 'Thanh toán toàn bộ ngay hôm nay' },
                                    { value: 'partial', label: 'Trả một phần', desc: 'Trả trước một phần, còn lại ghi nợ' },
                                    { value: 'credit', label: 'Ghi nợ (trả sau)', desc: 'Chưa thanh toán, sẽ trả theo hạn' },
                                ].map((opt) => (
                                    <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${paymentType === opt.value ? '#0ea5e9' : '#e5e7eb'}`, backgroundColor: paymentType === opt.value ? '#f0f9ff' : 'white' }}>
                                        <input type="radio" name="paymentType" value={opt.value} checked={paymentType === opt.value} onChange={() => setPaymentType(opt.value)} style={{ marginTop: 2 }} />
                                        <div>
                                            <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{opt.label}</p>
                                            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{opt.desc}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                        {paymentType === 'partial' && (
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                                    Số tiền trả ngay (đ) <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="number" min="1"
                                    placeholder={`Tối đa ${Number(receipt?.total_amount || 0).toLocaleString('vi-VN')} đ`}
                                    value={amountPaid}
                                    onChange={(e) => setAmountPaid(e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
                                />
                            </div>
                        )}
                        {(paymentType === 'credit' || paymentType === 'partial') && (
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                                    Hạn thanh toán
                                </label>
                                <input
                                    type="date"
                                    value={dueDatePayable}
                                    onChange={(e) => setDueDatePayable(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
                                />
                                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>Để trống sẽ dùng kỳ hạn mặc định của nhà cung cấp</p>
                            </div>
                        )}
                    </div>
                )
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span>Vui lòng nhập lý do từ chối để nhân viên biết cần điều chỉnh gì.</span>
                        <textarea
                            autoFocus
                            rows={3}
                            placeholder="VD: Sai số lượng, thiếu chứng từ, sản phẩm không hợp lệ..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: '1px solid #d1d5db',
                                fontSize: 14,
                                resize: 'vertical',
                                outline: 'none',
                            }}
                        />
                    </div>
                )
        }
        confirmLabel={confirmType === 'approve' ? 'Duyệt nhập kho' : 'Xác nhận từ chối'}
        confirmVariant={confirmType === 'reject' ? 'destructive' : 'default'}
        loading={submitting}
        onConfirm={runStatusChange}
      />
    </ManagerPageFrame>
    );
}
