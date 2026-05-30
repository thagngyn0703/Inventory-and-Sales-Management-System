import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { InlineNotice } from '../../components/ui/inline-notice';
import { downloadTaxReportExcel, getTaxReport } from '../../services/analyticsApi';

function toDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtVND(v) {
  return `${Number(v || 0).toLocaleString('vi-VN')}đ`;
}

export default function ManagerTaxReport() {
  const now = new Date();
  const todayStr = toDateInput(now);
  const firstOfMonth = toDateInput(new Date(now.getFullYear(), now.getMonth(), 1));

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayStr);
  const [presumptiveRate, setPresumptiveRate] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [businessTypeHint, setBusinessTypeHint] = useState('');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getTaxReport({
        from,
        to,
        presumptive_rate: businessTypeHint === 'ho_kinh_doanh' ? presumptiveRate : undefined,
      });
      setPayload(data);
      setBusinessTypeHint(String(data?.store?.business_type || ''));
    } catch (e) {
      setError(e.message || 'Không thể tải báo cáo thuế');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, presumptiveRate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const businessType = String(payload?.store?.business_type || businessTypeHint || '');
  const isHousehold = businessType === 'ho_kinh_doanh' || payload?.report_type === 'household_business';

  const businessNote = useMemo(() => {
    if (payload?.business_note) return payload.business_note;
    if (isHousehold) {
      return 'Số liệu này dùng để kê khai mẫu 01/CNKD trên app eTax Mobile.';
    }
    return 'Số liệu dùng để đối chiếu tờ khai thuế GTGT mẫu 01/GTGT.';
  }, [payload, isHousehold]);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      const { blob, fileName } = await downloadTaxReportExcel({
        from,
        to,
        presumptive_rate: isHousehold ? presumptiveRate : undefined,
      });
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(e.message || 'Không thể xuất báo cáo thuế');
    } finally {
      setExporting(false);
    }
  }, [from, to, presumptiveRate]);

  return (
    <ManagerPageFrame>
      <StaffPageShell
        eyebrow="Báo cáo"
        eyebrowIcon={BarChart3}
        title="Báo cáo thuế"
        subtitle="Một nơi duy nhất để xem số liệu thuế theo kỳ và xuất file làm việc."
      >
        <Card className="mb-4 border-slate-200/80 shadow-sm">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <label className="text-sm font-medium text-slate-700">
              Từ ngày
              <input
                type="date"
                value={from}
                max={todayStr}
                onChange={(e) => setFrom(e.target.value)}
                className="ml-2 h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none ring-teal-200/80 focus:ring-2"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Đến ngày
              <input
                type="date"
                value={to}
                max={todayStr}
                onChange={(e) => setTo(e.target.value)}
                className="ml-2 h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none ring-teal-200/80 focus:ring-2"
              />
            </label>
            {isHousehold && (
              <label className="text-sm font-medium text-slate-700">
                Thuế khoán HKD (%)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={presumptiveRate}
                  onChange={(e) => setPresumptiveRate(Number(e.target.value) || 0)}
                  className="ml-2 h-10 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none ring-teal-200/80 focus:ring-2"
                />
              </label>
            )}
            <Button type="button" className="h-10 rounded-xl px-4" onClick={fetchReport}>
              Xem báo cáo
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-xl px-4 gap-2 border-teal-200 text-teal-700 hover:bg-teal-50" onClick={handleExport} disabled={exporting || loading}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Xuất Excel
            </Button>
          </CardContent>
        </Card>

        <InlineNotice message={error} type="error" className="mb-3" />

        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="p-4">
            {loading ? (
              <div className="flex justify-center py-12 text-slate-500">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
            ) : !payload ? (
              <p className="py-6 text-sm text-slate-500">Chưa có dữ liệu báo cáo thuế.</p>
            ) : (
              <div className="space-y-3 text-sm text-slate-700">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-teal-500" />
                  Chế độ hiện tại: {isHousehold ? 'Hộ kinh doanh' : 'Doanh nghiệp'}
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  BÁO CÁO THUẾ ({isHousehold ? 'Hộ kinh doanh' : 'Doanh nghiệp'})
                </h3>
                <p>Kỳ báo cáo: {from} - {to}</p>
                {isHousehold ? (
                  <>
                    <p>Tổng doanh thu ghi nhận: <strong>{fmtVND(payload?.totals?.total_revenue)}</strong></p>
                    <p>
                      Mức thuế khoán dự kiến ({Number(payload?.totals?.presumptive_tax_rate || presumptiveRate).toFixed(1)}%):
                      <strong> {fmtVND(payload?.totals?.presumptive_tax_estimate)}</strong>
                    </p>
                  </>
                ) : (
                  <>
                    <p>Doanh thu chưa thuế: <strong>{fmtVND(payload?.totals?.output_revenue_net)}</strong></p>
                    <p>VAT đầu ra: <strong>{fmtVND(payload?.totals?.output_vat)}</strong></p>
                    {payload?.totals?.input_vat != null && (
                      <p>VAT đầu vào: <strong>{fmtVND(payload?.totals?.input_vat)}</strong></p>
                    )}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full min-w-[400px] text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-3 py-2">Thuế suất</th>
                            <th className="px-3 py-2 text-right">Doanh thu chưa thuế</th>
                            <th className="px-3 py-2 text-right">VAT đầu ra</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(payload?.output_vat_breakdown || []).map((row) => (
                            <tr key={`rate-${row.tax_rate}`} className="border-t border-slate-100">
                              <td className="px-3 py-2">{Number(row.tax_rate || 0)}%</td>
                              <td className="px-3 py-2 text-right">{fmtVND(row.net_amount)}</td>
                              <td className="px-3 py-2 text-right">{fmtVND(row.vat_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <p><strong>Giải thích cột:</strong></p>
                      <p>- <strong>Thuế suất</strong>: mức VAT áp cho dòng hàng (0%, 5%, 8%, 10%).</p>
                      <p>- <strong>Doanh thu chưa thuế</strong>: doanh thu thuần trước VAT của từng nhóm thuế suất.</p>
                      <p>- <strong>VAT đầu ra</strong>: tiền VAT thu hộ Nhà nước từ bán hàng ở nhóm thuế suất đó.</p>
                    </div>
                  </>
                )}
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Ghi chú nghiệp vụ: {businessNote}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
