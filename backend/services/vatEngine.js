const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Store = require('../models/Store');
const TaxPolicy = require('../models/TaxPolicy');

const TAX_STATUS = {
    TAXABLE: 'taxable',
    NON_TAXABLE: 'non_taxable',
    NOT_SUBJECT: 'not_subject',
    SPECIAL_SCHEME: 'special_scheme',
};

function roundCurrency(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function computeTaxBreakdown(lineNetTotal, rate, priceIncludesTax) {
    const total = roundCurrency(lineNetTotal);
    const taxRate = Number(rate) || 0;
    if (taxRate <= 0) {
        return { line_subtotal_amount: total, line_tax_amount: 0 };
    }
    if (priceIncludesTax) {
        const subtotal = roundCurrency(total / (1 + taxRate / 100));
        return { line_subtotal_amount: subtotal, line_tax_amount: roundCurrency(total - subtotal) };
    }
    const tax = roundCurrency(total * (taxRate / 100));
    return { line_subtotal_amount: total, line_tax_amount: tax };
}

async function resolveEffectivePolicy({ storeId, taxPointAt }) {
    const when = taxPointAt ? new Date(taxPointAt) : new Date();
    const dateFilter = {
        effective_from: { $lte: when },
        $or: [{ effective_to: null }, { effective_to: { $gte: when } }],
    };
    const scopedStore = storeId && mongoose.isValidObjectId(storeId) ? storeId : null;

    const storePolicy = scopedStore
        ? await TaxPolicy.findOne({
              scope: 'store',
              store_id: scopedStore,
              approval_state: 'active',
              ...dateFilter,
          })
              .sort({ effective_from: -1 })
              .lean()
        : null;
    if (storePolicy) return storePolicy;
    return TaxPolicy.findOne({
        scope: 'global',
        approval_state: 'active',
        ...dateFilter,
    })
        .sort({ effective_from: -1 })
        .lean();
}

function decideTaxStatus(baseRate) {
    if (baseRate === 0) return TAX_STATUS.NON_TAXABLE;
    return TAX_STATUS.TAXABLE;
}

function shouldApplyReduction({ baseRate, product, category, policy, taxPointAt }) {
    if (baseRate !== 10) return { apply: false, reason: 'base_rate_not_10' };
    const when = new Date(taxPointAt || Date.now());
    const reductionWindowStart = new Date('2025-07-01T00:00:00.000Z');
    const reductionWindowEnd = new Date('2026-12-31T23:59:59.999Z');
    if (when < reductionWindowStart || when > reductionWindowEnd) {
        return { apply: false, reason: 'outside_reduction_window' };
    }
    const exclusionRules = Array.isArray(policy?.exclusion_rules) ? policy.exclusion_rules : [];
    const tags = [
        ...(Array.isArray(product?.tax_tags) ? product.tax_tags : []),
        ...(Array.isArray(category?.tax_tags) ? category.tax_tags : []),
    ];
    const excluded = tags.some((t) => exclusionRules.includes(String(t)));
    if (excluded) return { apply: false, reason: 'excluded_by_policy_rule' };
    return { apply: true, reason: 'reduction_10_to_8' };
}

async function computeInvoiceTaxSnapshot({
    storeId,
    invoiceTaxPointAt,
    items = [],
    invoiceLevelDiscount = 0,
}) {
    const policy = await resolveEffectivePolicy({ storeId, taxPointAt: invoiceTaxPointAt });
    const store = await Store.findById(storeId).select('tax_rate price_includes_tax business_type').lean();
    const businessType = String(store?.business_type || 'ho_kinh_doanh');
    const strictCompliance = policy?.strict_compliance !== false;
    const fallbackRate = businessType === 'ho_kinh_doanh' ? 0 : Number(store?.tax_rate) || 0;
    const priceIncludesTax = store?.price_includes_tax !== false;

    const productIds = [...new Set((items || []).map((it) => String(it.product_id || '')).filter(Boolean))];
    const products = await Product.find({ _id: { $in: productIds } }).select('_id category_id vat_rate tax_override_enabled tax_tags').lean();
    const productsById = new Map(products.map((p) => [String(p._id), p]));
    const categoryIds = [...new Set(products.map((p) => String(p.category_id || '')).filter(Boolean))];
    const categories = categoryIds.length
        ? await Category.find({ _id: { $in: categoryIds } }).select('_id vat_rate tax_profile tax_tags').lean()
        : [];
    const categoriesById = new Map(categories.map((c) => [String(c._id), c]));

    const grossTotal = (items || []).reduce((sum, line) => sum + (Number(line.line_total) || 0), 0);
    const safeDiscount = Math.max(0, roundCurrency(invoiceLevelDiscount));

    let subtotal_amount = 0;
    let tax_amount = 0;
    const rateSet = new Set();
    const computedItems = (items || []).map((line) => {
        const pid = String(line.product_id || '');
        const product = productsById.get(pid);
        const category = categoriesById.get(String(product?.category_id || ''));
        const hasProductOverride = Boolean(product?.tax_override_enabled);
        const sourceRate = hasProductOverride
            ? Number(product?.vat_rate)
            : category?.vat_rate != null
              ? Number(category.vat_rate)
              : fallbackRate;
        const baseRate = Number.isFinite(sourceRate) && sourceRate >= 0 ? sourceRate : 0;
        const tax_status = decideTaxStatus(baseRate);
        const reduction = shouldApplyReduction({
            baseRate,
            product,
            category,
            policy,
            taxPointAt: invoiceTaxPointAt,
        });
        const finalRate = reduction.apply ? 8 : baseRate;
        const lineTotal = roundCurrency(line.line_total);
        const ratio = grossTotal > 0 ? lineTotal / grossTotal : 0;
        const lineDiscount = roundCurrency(safeDiscount * ratio);
        const lineNetTotal = Math.max(0, roundCurrency(lineTotal - lineDiscount));
        const breakdown = computeTaxBreakdown(lineNetTotal, finalRate, priceIncludesTax);
        subtotal_amount += breakdown.line_subtotal_amount;
        tax_amount += breakdown.line_tax_amount;
        rateSet.add(String(finalRate));

        const rate_source = hasProductOverride ? 'product_override' : (category?.vat_rate != null ? 'category' : 'store_default');
        const missingMapping = !hasProductOverride && category?.vat_rate == null && store?.tax_rate == null;
        if (strictCompliance && missingMapping && businessType !== 'ho_kinh_doanh') {
            const error = new Error('Tax mapping required for one or more line items.');
            error.code = 'TAX_MAPPING_REQUIRED';
            throw error;
        }
        return {
            ...line,
            tax_status,
            declaration_stage: 'retail',
            base_rate: baseRate,
            reduced_rate: reduction.apply ? 8 : null,
            final_rate: finalRate,
            reduction_reason_code: reduction.reason,
            legal_basis_ref: policy?.legal_basis_ref || '',
            policy_version_id: policy?._id || null,
            rate_source,
            requires_manual_tax_review: !strictCompliance && missingMapping,
            vat_rate_snapshot: finalRate,
            line_net_total: lineNetTotal,
            line_subtotal_amount: breakdown.line_subtotal_amount,
            line_tax_amount: breakdown.line_tax_amount,
        };
    });

    return {
        policy,
        strict_compliance: strictCompliance,
        price_includes_tax: priceIncludesTax,
        items: computedItems,
        subtotal_amount: roundCurrency(subtotal_amount),
        tax_amount: roundCurrency(tax_amount),
        tax_is_mixed: rateSet.size > 1,
        tax_rate_snapshot: rateSet.size === 1 ? Number([...rateSet][0]) : fallbackRate,
    };
}

module.exports = {
    TAX_STATUS,
    computeInvoiceTaxSnapshot,
};
