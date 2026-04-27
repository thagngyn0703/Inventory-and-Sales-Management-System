import React, { useMemo } from "react";
import Chart from "react-apexcharts";

function shortMonthLabel(key) {
    if (!key || typeof key !== "string") return "";
    const [y, m] = key.split("-");
    if (!y || !m) return key;
    return `${parseInt(m, 10)}/${y.slice(2)}`;
}

/**
 * Biểu đồ sản phẩm mới vs đơn hàng theo tháng (dual axis, ApexCharts).
 * rows: API monthlyStoreStats.rows — thứ tự bất kỳ; component sắp xếp cũ → mới.
 */
export default function AdminMonthlyStatsChart({ rows = [], loading = false }) {
    const sorted = useMemo(() => {
        return [...(rows || [])].sort((a, b) => String(a.key).localeCompare(String(b.key)));
    }, [rows]);

    const categories = useMemo(() => sorted.map((r) => shortMonthLabel(r.key)), [sorted]);
    const productsData = useMemo(() => sorted.map((r) => r.productsCreated ?? 0), [sorted]);
    const ordersData = useMemo(() => sorted.map((r) => r.orders ?? 0), [sorted]);

    const options = useMemo(
        () => ({
            chart: {
                type: "area",
                toolbar: { show: false },
                fontFamily: "inherit",
                zoom: { enabled: false },
                animations: { enabled: true, speed: 450 },
            },
            colors: ["#8b5cf6", "#0ea5e9"],
            stroke: {
                width: [3, 3],
                curve: "smooth",
            },
            fill: {
                type: "gradient",
                gradient: {
                    shade: "light",
                    type: "vertical",
                    shadeIntensity: 0.35,
                    opacityFrom: 0.55,
                    opacityTo: 0.06,
                    stops: [0, 90, 100],
                },
            },
            markers: {
                size: 4,
                strokeWidth: 2,
                strokeColors: "#fff",
                hover: { size: 6 },
            },
            dataLabels: { enabled: false },
            xaxis: {
                categories,
                labels: {
                    style: { fontSize: "11px", colors: "#64748b" },
                    rotate: -45,
                    rotateAlways: sorted.length > 8,
                },
                axisBorder: { show: false },
                axisTicks: { show: false },
            },
            yaxis: [
                {
                    seriesName: "Sản phẩm tạo mới",
                    title: {
                        text: "Sản phẩm mới",
                        style: { color: "#7c3aed", fontSize: "12px", fontWeight: 600 },
                    },
                    labels: {
                        formatter: (v) => (Number.isFinite(v) ? `${Math.round(v)}` : ""),
                        style: { colors: "#94a3b8", fontSize: "11px" },
                    },
                },
                {
                    opposite: true,
                    seriesName: "Đơn hàng",
                    title: {
                        text: "Đơn hàng",
                        style: { color: "#0284c7", fontSize: "12px", fontWeight: 600 },
                    },
                    labels: {
                        formatter: (v) => (Number.isFinite(v) ? `${Math.round(v)}` : ""),
                        style: { colors: "#94a3b8", fontSize: "11px" },
                    },
                },
            ],
            grid: {
                borderColor: "#f1f5f9",
                strokeDashArray: 4,
                xaxis: { lines: { show: false } },
                padding: { left: 8, right: 12 },
            },
            legend: {
                position: "top",
                horizontalAlign: "right",
                fontSize: "13px",
                labels: { colors: "#334155" },
                markers: { radius: 5 },
            },
            tooltip: {
                shared: true,
                intersect: false,
                x: { show: true },
                y: {
                    formatter: (val) => (val != null ? Number(val).toLocaleString("vi-VN") : "0"),
                },
            },
        }),
        [categories, sorted.length]
    );

    const series = useMemo(
        () => [
            { name: "Sản phẩm tạo mới", type: "area", data: productsData },
            { name: "Đơn hàng", type: "area", data: ordersData },
        ],
        [productsData, ordersData]
    );

    if (loading) {
        return (
            <div className="admin-dash-chart-placeholder">Đang tải biểu đồ…</div>
        );
    }

    if (!sorted.length) {
        return (
            <div className="admin-dash-chart-placeholder">Chưa có dữ liệu trong khoảng thời gian này.</div>
        );
    }

    return (
        <div className="admin-dash-chart-wrap">
            <Chart options={options} series={series} type="area" height={380} />
        </div>
    );
}
