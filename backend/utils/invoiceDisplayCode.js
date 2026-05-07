function pad2(n) {
    return String(Number(n) || 0).padStart(2, '0');
}

function buildInvoiceDisplayCode(invoice) {
    if (!invoice || typeof invoice !== 'object') return 'HD-UNKNOWN';
    const sourceDate = invoice.invoice_at || invoice.created_at || new Date();
    const dt = new Date(sourceDate);
    const yy = String(dt.getFullYear()).slice(-2);
    const mm = pad2(dt.getMonth() + 1);
    const dd = pad2(dt.getDate());
    const rawId = String(invoice._id || '').trim();
    const suffix = rawId ? rawId.slice(-6).toUpperCase() : 'XXXXXX';
    return `HD${yy}${mm}${dd}-${suffix}`;
}

function decorateInvoiceDisplayCode(invoice) {
    if (!invoice || typeof invoice !== 'object') return invoice;
    return {
        ...invoice,
        display_code: buildInvoiceDisplayCode(invoice),
    };
}

function decorateInvoiceListDisplayCode(invoices = []) {
    return (Array.isArray(invoices) ? invoices : []).map((inv) => decorateInvoiceDisplayCode(inv));
}

module.exports = {
    buildInvoiceDisplayCode,
    decorateInvoiceDisplayCode,
    decorateInvoiceListDisplayCode,
};
