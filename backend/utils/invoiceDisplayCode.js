const mongoose = require('mongoose');

const DISPLAY_CODE_PATTERN = /^HD(\d{2})(\d{2})(\d{2})-([A-F0-9]{6})$/i;

function pad2(n) {
    return String(Number(n) || 0).padStart(2, '0');
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDisplayCode(raw) {
    const normalized = String(raw || '').trim().toUpperCase();
    const match = normalized.match(DISPLAY_CODE_PATTERN);
    if (!match) return null;
    return {
        yy: match[1],
        mm: match[2],
        dd: match[3],
        suffix: match[4],
        normalized,
    };
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

/**
 * Resolve invoice by Mongo _id or short display code (HDYYMMDD-XXXXXX).
 * Used by GET /api/invoices/:id so staff can paste the code shown on invoice lists.
 */
async function findInvoiceByLookupInput(SalesInvoiceModel, rawInput, baseFilter = {}) {
    const input = String(rawInput || '').trim();
    if (!input) return null;

    if (mongoose.isValidObjectId(input)) {
        return SalesInvoiceModel.findOne({ ...baseFilter, _id: input });
    }

    const byStoredCode = await SalesInvoiceModel.findOne({
        ...baseFilter,
        display_code: { $regex: new RegExp(`^${escapeRegex(input)}$`, 'i') },
    });
    if (byStoredCode) return byStoredCode;

    const parsed = parseDisplayCode(input);
    if (!parsed) return null;

    const year = 2000 + Number(parsed.yy);
    const month = Number(parsed.mm) - 1;
    const day = Number(parsed.dd);
    if (!Number.isFinite(year) || month < 0 || month > 11 || day < 1 || day > 31) {
        return null;
    }

    const start = new Date(year, month, day, 0, 0, 0, 0);
    const end = new Date(year, month, day, 23, 59, 59, 999);

    const dayInvoices = await SalesInvoiceModel.find({
        ...baseFilter,
        $or: [
            { invoice_at: { $gte: start, $lte: end } },
            { created_at: { $gte: start, $lte: end } },
        ],
    }).lean();

    const exactMatches = dayInvoices.filter((inv) => {
        const code = (inv.display_code || buildInvoiceDisplayCode(inv)).toUpperCase();
        return code === parsed.normalized;
    });
    if (exactMatches.length === 1) {
        return SalesInvoiceModel.findById(exactMatches[0]._id);
    }

    const suffixMatches = dayInvoices.filter((inv) => {
        const rawId = String(inv._id || '').trim();
        return rawId.slice(-6).toUpperCase() === parsed.suffix;
    });
    if (suffixMatches.length === 1) {
        return SalesInvoiceModel.findById(suffixMatches[0]._id);
    }

    return null;
}

module.exports = {
    buildInvoiceDisplayCode,
    decorateInvoiceDisplayCode,
    decorateInvoiceListDisplayCode,
    parseDisplayCode,
    findInvoiceByLookupInput,
};
