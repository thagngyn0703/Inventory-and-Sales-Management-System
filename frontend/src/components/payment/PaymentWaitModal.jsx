import React, { useMemo, useState } from 'react';
import { Loader2, TriangleAlert, QrCode } from 'lucide-react';
import { Platform } from 'react-bits/lib/modules/Platform';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '0';
  return Number(n).toLocaleString('vi-VN') + 'đ';
}

export default function PaymentWaitModal({
  pendingPayment,
  bankCode,
  bankAccountNumber,
  storeName,
  onCancel,
}) {
  const [qrError, setQrError] = useState(false);
  const waitingHint = Platform.select({
    web: 'Đang chờ xác nhận từ ngân hàng...',
    default: 'Đang chờ xác nhận...',
  });

  const qrUrl = useMemo(() => {
    if (!pendingPayment) return '';
    return `https://img.vietqr.io/image/${bankCode}-${bankAccountNumber}-compact2.png?amount=${pendingPayment.totalAmount}&addInfo=${encodeURIComponent(
      pendingPayment.paymentRef
    )}&accountName=${encodeURIComponent(storeName || 'Cua hang IMS')}`;
  }, [pendingPayment, bankCode, bankAccountNumber, storeName]);

  if (!pendingPayment) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]">
      <Card className="w-full max-w-[430px] rounded-2xl">
        <CardContent className="space-y-4 p-6">
          <div className="text-center">
            <div className="text-xl font-bold text-slate-900">Chờ thanh toán chuyển khoản</div>
            <div className="mt-1 text-sm text-slate-500">Yêu cầu khách quét mã QR bên dưới</div>
            <Badge className="mt-2">Thanh toán QR</Badge>
          </div>

          <div className="rounded-2xl border-2 border-sky-400 bg-sky-50 p-4">
            {qrError ? (
              <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-slate-500">
                <QrCode className="h-9 w-9" />
                <span className="text-sm">Không thể tải QR. Vui lòng chuyển khoản thủ công.</span>
              </div>
            ) : (
              <img
                src={qrUrl}
                alt="QR thanh toán"
                className="mx-auto h-[200px] w-[200px] object-contain mix-blend-multiply"
                onError={() => setQrError(true)}
              />
            )}
          </div>

          <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Số tiền:</span>
              <span className="text-lg font-bold text-sky-600">{formatMoney(pendingPayment.totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Nội dung CK:</span>
              <span className="font-mono font-bold text-slate-900">{pendingPayment.paymentRef}</span>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-amber-100 p-2 text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="text-xs">
                Khách phải ghi đúng nội dung để hệ thống tự xác nhận.
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
            {waitingHint}
          </div>

          <Button variant="outline" className="w-full" onClick={onCancel}>
            Hủy / Thanh toán tiền mặt
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
