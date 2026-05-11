import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInvoice } from '../../services/invoicesApi';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { InlineNotice } from '../../components/ui/inline-notice';
import { Receipt, ArrowLeft } from 'lucide-react';
import ManagerInvoiceReadOnlyPreview from './ManagerInvoiceReadOnlyPreview';
import './ManagerDashboard.css';
import '../SaleDashboard/SalesPOS.css';

export default function ManagerInvoiceView() {
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
    if (id && id !== 'new') fetchInvoice();
  }, [id]);

  const shortId = invoice?.display_code || (invoice?._id ? String(invoice._id).slice(-8).toUpperCase() : '');

  return (
    <ManagerPageFrame showNotificationBell={false}>
      <StaffPageShell
        eyebrow="Hóa đơn"
        eyebrowIcon={Receipt}
        title={
          loading
            ? 'Đang tải…'
            : error
              ? 'Không tải được'
              : invoice
                ? `Phiếu ${shortId}`
                : 'Xem hóa đơn'
        }
        subtitle={
          invoice
            ? `${new Date(invoice.created_at || invoice.invoice_at).toLocaleString('vi-VN')} · ${invoice.recipient_name || 'Khách lẻ'}`
            : 'Xem nhanh nội dung đơn (chỉ đọc).'
        }
        headerActions={
          <Button type="button" variant="outline" className="gap-2" onClick={() => navigate('/manager/invoices')}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Quay lại
          </Button>
        }
      >
        {loading && (
          <p className="rounded-2xl border border-slate-200/80 bg-white py-12 text-center text-sm text-slate-500 shadow-sm">
            Đang tải dữ liệu…
          </p>
        )}
        {!loading && error && <InlineNotice message={error} type="error" />}
        {!loading && !error && invoice && <ManagerInvoiceReadOnlyPreview invoice={invoice} />}
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
