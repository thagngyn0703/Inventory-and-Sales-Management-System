/**
 * Mã hiển thị hóa đơn thống nhất (khớp backend utils/invoiceDisplayCode.js).
 */
export function buildInvoiceDisplayCode(invoice) {
  if (!invoice || typeof invoice !== 'object') return '';
  if (invoice.display_code) return String(invoice.display_code).trim();
  const sourceDate = invoice.invoice_at || invoice.created_at || new Date();
  const dt = new Date(sourceDate);
  if (Number.isNaN(dt.getTime())) return '';
  const yy = String(dt.getFullYear()).slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const rawId = String(invoice._id || '').trim();
  const suffix = rawId ? rawId.slice(-6).toUpperCase() : 'XXXXXX';
  return `HD${yy}${mm}${dd}-${suffix}`;
}

export function getInvoiceDisplayCode(invoice) {
  return buildInvoiceDisplayCode(invoice) || String(invoice?._id || '').trim();
}
