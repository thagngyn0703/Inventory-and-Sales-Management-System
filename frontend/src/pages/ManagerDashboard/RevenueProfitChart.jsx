import React, { useMemo } from 'react';
import Chart from 'react-apexcharts';

function fmtVND(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${Number(n).toLocaleString('vi-VN')}₫`;
}

/**
 * Biểu đồ Doanh thu vs Lợi nhuận thực (Grouped Bar, ApexCharts)
 * Props:
 *   data: [{ label, revenue, profit }]
 *   loading: boolean
 */
export default function RevenueProfitChart({ data = [], loading = false }) {
  const categories = useMemo(() => data.map((d) => d.label), [data]);
  const revenueData = useMemo(
    () => data.map((d) => Math.max(0, Number(d.sales_revenue ?? d.revenue ?? 0))),
    [data]
  );
  const returnData = useMemo(
    () => data.map((d) => Math.max(0, Number(d.return_amount ?? 0))),
    [data]
  );
  const netRevenueData = useMemo(
    () =>
      data.map((d) =>
        Math.max(
          0,
          Number(
            d.net_revenue ??
              (Math.max(0, Number(d.sales_revenue ?? d.revenue ?? 0)) - Math.max(0, Number(d.return_amount ?? 0)))
          )
        )
      ),
    [data]
  );
  const profitData = useMemo(() => data.map((d) => d.profit ?? 0), [data]);

  const options = useMemo(
    () => ({
      chart: {
        type: 'bar',
        toolbar: { show: false },
        fontFamily: 'inherit',
        animations: { enabled: true, speed: 400 },
      },
      colors: ['#6366f1', '#f97316', '#10b981'],
      plotOptions: {
        bar: {
          borderRadius: 5,
          columnWidth: '60%',
          dataLabels: { position: 'top' },
        },
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'light',
          type: 'vertical',
          shadeIntensity: 0.3,
          opacityFrom: 1,
          opacityTo: 0.85,
        },
      },
      dataLabels: { enabled: false },
      xaxis: {
        categories,
        labels: {
          style: { fontSize: '12px', colors: '#6b7280' },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          formatter: (val) => fmtVND(val),
          style: { fontSize: '11px', colors: '#9ca3af' },
        },
      },
      grid: {
        borderColor: '#f1f5f9',
        strokeDashArray: 4,
        xaxis: { lines: { show: false } },
      },
      legend: {
        position: 'top',
        horizontalAlign: 'right',
        fontSize: '13px',
        labels: { colors: '#374151' },
        markers: { radius: 4 },
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: {
          formatter: (val) => `${Number(val).toLocaleString('vi-VN')}₫`,
        },
        custom: ({ series, dataPointIndex }) => {
          const rev = series[0][dataPointIndex] ?? 0;
          const returned = series[1][dataPointIndex] ?? 0;
          const profit = series[2][dataPointIndex] ?? 0;
          const netRevenue = netRevenueData[dataPointIndex] ?? (rev - returned);
          const margin = netRevenue > 0 ? ((profit / netRevenue) * 100).toFixed(1) : '--';
          const label = categories[dataPointIndex] ?? '';
          return `
            <div style="padding:10px 14px;font-size:13px;line-height:1.7;min-width:180px">
              <div style="font-weight:700;margin-bottom:4px;color:#1e293b">${label}</div>
              <div style="display:flex;justify-content:space-between;gap:16px">
                <span style="color:#6366f1">● Doanh thu bán</span>
                <span style="font-weight:600">${Number(rev).toLocaleString('vi-VN')}₫</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px">
                <span style="color:#f97316">● Hoàn trả</span>
                <span style="font-weight:600">${Number(returned).toLocaleString('vi-VN')}₫</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px">
                <span style="color:#64748b">Doanh thu thuần</span>
                <span style="font-weight:600">${Number(netRevenue).toLocaleString('vi-VN')}₫</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px">
                <span style="color:#10b981">● Lợi nhuận gộp</span>
                <span style="font-weight:600">${Number(profit).toLocaleString('vi-VN')}₫</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px;margin-top:4px;border-top:1px solid #e2e8f0;padding-top:4px">
                <span style="color:#64748b">Biên lãi</span>
                <span style="font-weight:700;color:${margin === '--' ? '#64748b' : parseFloat(margin) >= 20 ? '#059669' : parseFloat(margin) >= 10 ? '#d97706' : '#dc2626'}">${margin === '--' ? '--' : `${margin}%`}</span>
              </div>
            </div>
          `;
        },
      },
    }),
    [categories]
  );

  const series = useMemo(
    () => [
      { name: 'Doanh thu', data: revenueData },
      { name: 'Hoàn trả', data: returnData },
      { name: 'Lợi nhuận gộp', data: profitData },
    ],
    [revenueData, returnData, profitData]
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, color: '#9ca3af', fontSize: 14 }}>
        Đang tải biểu đồ...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, color: '#9ca3af', fontSize: 14 }}>
        Chưa có dữ liệu
      </div>
    );
  }

  return (
    <Chart options={options} series={series} type="bar" height={320} />
  );
}
