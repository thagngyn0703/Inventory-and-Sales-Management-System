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
