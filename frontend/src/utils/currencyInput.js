export function formatCurrencyInput(rawValue) {
    const digits = String(rawValue || '').replace(/\D/g, '');
    if (!digits) return '';
    return `${Number(digits).toLocaleString('vi-VN')} đ`;
}

export function parseCurrencyInput(rawValue) {
    const digits = String(rawValue || '').replace(/\D/g, '');
    return digits ? Number(digits) : 0;
}

export function toCurrencyInputFromNumber(value) {
    return formatCurrencyInput(String(Math.max(0, Number(value) || 0)));
}

/** Số nguyên VNĐ: nhóm 3 chữ số bằng dấu chấm (vd. 1.000.000), chỉ từ chữ số trong chuỗi nhập. */
export function formatVndIntegerDots(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return '';
    const n = Math.round(Number(digits));
    if (!Number.isFinite(n) || n < 0) return '';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
