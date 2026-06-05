/**
 * Mã hiển thị hóa đơn thống nhất (khớp backend utils/invoiceDisplayCode.js).
 */
export function buildInvoiceDisplayCode(invoice) {
  if (!invoice) return '';

  if (typeof invoice === 'string') {
    const rawId = invoice.trim();
    if (rawId.length === 24) {
      const timestamp = parseInt(rawId.substring(0, 8), 16) * 1000;
      if (!Number.isNaN(timestamp)) {
        const dt = new Date(timestamp);
        const yy = String(dt.getFullYear()).slice(-2);
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        const suffix = rawId.slice(-6).toUpperCase();
        return `HD${yy}${mm}${dd}-${suffix}`;
      }
    }
    return rawId;
  }

  if (typeof invoice !== 'object') return '';
  if (invoice.display_code) return String(invoice.display_code).trim();

  const rawId = String(invoice._id || '').trim();
  let sourceDate = invoice.invoice_at || invoice.created_at;
  if (!sourceDate && rawId && rawId.length === 24) {
    const timestamp = parseInt(rawId.substring(0, 8), 16) * 1000;
    if (!Number.isNaN(timestamp)) {
      sourceDate = new Date(timestamp);
    }
  }

  const dt = new Date(sourceDate || new Date());
  if (Number.isNaN(dt.getTime())) return '';
  const yy = String(dt.getFullYear()).slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const suffix = rawId ? rawId.slice(-6).toUpperCase() : 'XXXXXX';
  return `HD${yy}${mm}${dd}-${suffix}`;
}

export function getInvoiceDisplayCode(invoice) {
  if (typeof invoice === 'string') {
    return buildInvoiceDisplayCode(invoice);
  }
  return buildInvoiceDisplayCode(invoice) || String(invoice?._id || '').trim();
}
