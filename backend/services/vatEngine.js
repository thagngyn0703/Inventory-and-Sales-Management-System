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

function roundCurrency(value, precision = 0) {
    const num = Number(value) || 0;
    const factor = 10 ** precision;
    return Math.round(num * factor) / factor;
}

function normalizeTaxCategory(code = '') {
    return String(code || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_');
}

function parseLegalRef(policy = null, lineLegalRef = null) {
    const policyLegal = policy?.legal_basis || {};
    const lineLegal = lineLegalRef || {};
    const legal = {
        law: String(lineLegal.law || policyLegal.law || policy?.legal_basis_ref || ''),
        article: String(lineLegal.article || policyLegal.article || ''),
        clause: String(lineLegal.clause || policyLegal.clause || ''),
        note: String(lineLegal.note || policyLegal.note || ''),
    };
    return legal;
}

function computeTaxAmountsForward(lineNetTotal, vatRate, exciseRate, precision = 0) {
    const base = roundCurrency(lineNetTotal, precision);
    const excise = exciseRate > 0 ? roundCurrency(base * (exciseRate / 100), precision) : 0;
    const vatTaxableBase = base + excise;
    const vat = vatRate > 0 ? roundCurrency(vatTaxableBase * (vatRate / 100), precision) : 0;
    const total = roundCurrency(base + excise + vat, precision);
    return { base, excise, vat, total };
}

function computeTaxAmountsReverse(lineGrossTotal, vatRate, exciseRate, precision = 0) {
    const gross = roundCurrency(lineGrossTotal, precision);
    if (vatRate <= 0 && exciseRate <= 0) {
        return { base: gross, excise: 0, vat: 0, total: gross };
    }
    const denominator = (1 + exciseRate / 100) * (1 + vatRate / 100);
    const base = denominator > 0 ? roundCurrency(gross / denominator, precision) : gross;
    const excise = exciseRate > 0 ? roundCurrency(base * (exciseRate / 100), precision) : 0;
    const vat = vatRate > 0 ? roundCurrency((base + excise) * (vatRate / 100), precision) : 0;
    const reconstructed = roundCurrency(base + excise + vat, precision);
    const drift = roundCurrency(gross - reconstructed, precision);
    const vatAdjusted = roundCurrency(vat + drift, precision);
    return { base, excise, vat: vatAdjusted, total: gross };
}

function resolveTaxCategoryRule({ policy, categoryCode, product, category, fallbackRate }) {
    const rules = policy?.tax_category_rules || {};
    const categoryRule = rules?.[categoryCode] || null;
    if (categoryRule) {
        return {
            tax_category: categoryCode,
            tax_status: categoryRule.tax_status || (Number(categoryRule.vat_rate) > 0 ? TAX_STATUS.TAXABLE : TAX_STATUS.NON_TAXABLE),
            vat_rate: Number(categoryRule.vat_rate) || 0,
            excise_rate: Number(categoryRule.excise_rate) || 0,
            legal_ref: parseLegalRef(policy, categoryRule.legal_ref),
            rate_source: 'policy',
        };
    }

    const hasProductOverride = Boolean(product?.tax_override_enabled);
    const sourceRate = hasProductOverride
        ? Number(product?.vat_rate)
        : category?.vat_rate != null
            ? Number(category.vat_rate)
            : fallbackRate;
    const baseRate = Number.isFinite(sourceRate) && sourceRate >= 0 ? sourceRate : 0;
    return {
        tax_category: categoryCode || 'DEFAULT',
        tax_status: baseRate === 0 ? TAX_STATUS.NON_TAXABLE : TAX_STATUS.TAXABLE,
        vat_rate: baseRate,
        excise_rate: 0,
        legal_ref: parseLegalRef(policy, null),
        rate_source: hasProductOverride ? 'product_override' : (category?.vat_rate != null ? 'category' : 'store_default'),
    };
}

function shouldApplyReduction({ baseRate, product, category, policy, taxPointAt, categoryCode }) {
    if (baseRate !== 10) return { apply: false, reason: 'base_rate_not_10' };
    const cfg = policy?.vat_reduction_rule || {};
    if (cfg.eligible === false) return { apply: false, reason: 'reduction_disabled' };
    const when = new Date(taxPointAt || Date.now());
    const start = cfg.effective_from ? new Date(cfg.effective_from) : new Date('2025-07-01T00:00:00.000Z');
    const end = cfg.effective_to ? new Date(cfg.effective_to) : new Date('2026-12-31T23:59:59.999Z');
    if (when < start || when > end) {
        return { apply: false, reason: 'outside_reduction_window' };
    }
    const tags = [
        ...(Array.isArray(product?.tax_tags) ? product.tax_tags : []),
        ...(Array.isArray(category?.tax_tags) ? category.tax_tags : []),
    ].map((t) => String(t).trim());

    const excludedCategories = Array.isArray(cfg.excluded_categories) ? cfg.excluded_categories.map(normalizeTaxCategory) : [];
    if (excludedCategories.includes(normalizeTaxCategory(categoryCode))) {
        return { apply: false, reason: 'excluded_tax_category' };
    }
    const exclusionRules = Array.isArray(cfg.exclusion_rules)
        ? cfg.exclusion_rules
        : Array.isArray(policy?.exclusion_rules)
            ? policy.exclusion_rules
            : [];
    const excludedByTag = tags.some((t) => exclusionRules.includes(String(t)));
    if (excludedByTag) return { apply: false, reason: 'excluded_by_policy_rule' };

    const eligibleCategories = Array.isArray(cfg.eligible_categories) ? cfg.eligible_categories.map(normalizeTaxCategory) : [];
    if (eligibleCategories.length > 0 && !eligibleCategories.includes(normalizeTaxCategory(categoryCode))) {
        return { apply: false, reason: 'not_in_eligible_category' };
    }
    const reducedRate = Number(cfg.reduced_rate);
    return { apply: true, reason: 'reduction_10_to_8', reducedRate: Number.isFinite(reducedRate) ? reducedRate : 8 };
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

async function computeInvoiceTaxSnapshot({
    storeId,
    invoiceTaxPointAt,
    items = [],
    invoiceLevelDiscount = 0,
}) {
    const policy = await resolveEffectivePolicy({ storeId, taxPointAt: invoiceTaxPointAt });
    const store = await Store.findById(storeId).select('tax_rate price_includes_tax business_type default_tax_profile').lean();
    const businessType = String(store?.business_type || 'ho_kinh_doanh');
    const strictCompliance = businessType === 'ho_kinh_doanh'
        ? false
        : (policy?.strict_compliance !== false);
    const fallbackRate = businessType === 'ho_kinh_doanh' ? 0 : Number(store?.tax_rate) || 0;
    const priceIncludesTax = store?.price_includes_tax !== false;
    const roundingMode = String(policy?.rounding_mode || 'half_up');
    const roundingPrecision = 0;

    const productIds = [...new Set((items || []).map((it) => String(it.product_id || '')).filter(Boolean))];
    const products = await Product.find({ _id: { $in: productIds } })
        .select('_id category_id vat_rate tax_override_enabled tax_tags tax_category tax_profile price_includes_tax tax_override_reason')
        .lean();
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
    const summaryByCategory = new Map();
    const computedItems = (items || []).map((line) => {
        const pid = String(line.product_id || '');
        const product = productsById.get(pid);
        const category = categoriesById.get(String(product?.category_id || ''));
        const taxCategoryCode = normalizeTaxCategory(
            line.tax_category
            || product?.tax_category
            || product?.tax_profile
            || category?.tax_profile
            || store?.default_tax_profile
            || 'DEFAULT'
        );
        const taxRule = resolveTaxCategoryRule({
            policy,
            categoryCode: taxCategoryCode,
            product,
            category,
            fallbackRate,
        });
        const householdMode = businessType === 'ho_kinh_doanh';
        const baseRate = householdMode ? 0 : (Number(taxRule.vat_rate) || 0);
        const exciseRate = householdMode ? 0 : (Number(taxRule.excise_rate) || 0);
        const tax_status = householdMode
            ? TAX_STATUS.SPECIAL_SCHEME
            : (taxRule.tax_status || TAX_STATUS.NON_TAXABLE);
        const reduction = householdMode
            ? { apply: false, reason: 'household_business_no_vat' }
            : shouldApplyReduction({
                baseRate,
                product,
                category,
                policy,
                taxPointAt: invoiceTaxPointAt,
                categoryCode: taxCategoryCode,
            });
        const finalRate = reduction.apply ? Number(reduction.reducedRate || 8) : baseRate;
        const lineTotal = roundCurrency(line.line_total, roundingPrecision);
        const ratio = grossTotal > 0 ? lineTotal / grossTotal : 0;
        const lineDiscount = roundCurrency(safeDiscount * ratio, roundingPrecision);
        const lineNetTotal = Math.max(0, roundCurrency(lineTotal - lineDiscount, roundingPrecision));
        const linePriceIncludesTax = line.price_includes_tax != null ? Boolean(line.price_includes_tax) : (product?.price_includes_tax != null ? Boolean(product.price_includes_tax) : priceIncludesTax);
        const taxAmounts = linePriceIncludesTax
            ? computeTaxAmountsReverse(lineNetTotal, finalRate, exciseRate, roundingPrecision)
            : computeTaxAmountsForward(lineNetTotal, finalRate, exciseRate, roundingPrecision);
        const totalTaxLine = roundCurrency((taxAmounts.excise || 0) + (taxAmounts.vat || 0), roundingPrecision);
        subtotal_amount += taxAmounts.base;
        tax_amount += totalTaxLine;
        rateSet.add(String(finalRate));
        const summaryKey = `${taxCategoryCode}:${finalRate}`;
        const current = summaryByCategory.get(summaryKey) || {
            tax_category: taxCategoryCode,
            vat_rate: finalRate,
            excise_rate: exciseRate,
            base_amount: 0,
            excise_amount: 0,
            vat_amount: 0,
            tax_amount: 0,
            gross_amount: 0,
        };
        current.base_amount += taxAmounts.base;
        current.excise_amount += taxAmounts.excise;
        current.vat_amount += taxAmounts.vat;
        current.tax_amount += totalTaxLine;
        current.gross_amount += taxAmounts.total;
        summaryByCategory.set(summaryKey, current);

        const missingMapping = !taxRule.rate_source || (taxRule.rate_source === 'store_default' && category?.vat_rate == null && !product?.tax_override_enabled && product?.tax_category == null && category?.tax_profile == null);
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
            reduced_rate: reduction.apply ? Number(reduction.reducedRate || 8) : null,
            final_rate: finalRate,
            reduction_reason_code: reduction.reason,
            legal_basis_ref: taxRule.legal_ref?.law || policy?.legal_basis_ref || '',
            legal_basis_article: taxRule.legal_ref?.article || '',
            legal_basis_clause: taxRule.legal_ref?.clause || '',
            legal_basis_note: taxRule.legal_ref?.note || '',
            policy_version_id: policy?._id || null,
            rate_source: householdMode ? 'household_business_mode' : taxRule.rate_source,
            requires_manual_tax_review: !strictCompliance && missingMapping,
            vat_rate_snapshot: finalRate,
            excise_rate_snapshot: exciseRate,
            tax_category_snapshot: taxCategoryCode,
            price_includes_tax_snapshot: linePriceIncludesTax,
            tax_override_reason_snapshot: String(line.tax_override_reason || product?.tax_override_reason || ''),
            line_net_total: lineNetTotal,
            line_subtotal_amount: taxAmounts.base,
            line_excise_amount: taxAmounts.excise,
            line_vat_amount: taxAmounts.vat,
            line_tax_amount: totalTaxLine,
        };
    });

    return {
        policy,
        strict_compliance: strictCompliance,
        price_includes_tax: priceIncludesTax,
        rounding_mode: roundingMode,
        items: computedItems,
        subtotal_amount: roundCurrency(subtotal_amount),
        tax_amount: roundCurrency(tax_amount),
        tax_is_mixed: rateSet.size > 1,
        tax_rate_snapshot: rateSet.size === 1 ? Number([...rateSet][0]) : fallbackRate,
        tax_breakdown_by_category: Array.from(summaryByCategory.values()).map((entry) => ({
            ...entry,
            base_amount: roundCurrency(entry.base_amount, roundingPrecision),
            excise_amount: roundCurrency(entry.excise_amount, roundingPrecision),
            vat_amount: roundCurrency(entry.vat_amount, roundingPrecision),
            tax_amount: roundCurrency(entry.tax_amount, roundingPrecision),
            gross_amount: roundCurrency(entry.gross_amount, roundingPrecision),
        })),
    };
}

module.exports = {
    TAX_STATUS,
    computeInvoiceTaxSnapshot,
};
