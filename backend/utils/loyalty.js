const Customer = require('../models/Customer');
const CustomerLoyaltyTransaction = require('../models/CustomerLoyaltyTransaction');

const DEFAULT_LOYALTY_SETTINGS = {
    enabled: false,
    earn: {
        spend_amount_vnd: 20000,
        points: 1,
        min_invoice_amount_vnd: 20000,
    },
    redeem: {
        point_value_vnd: 500,
        min_points: 10,
        max_percent_per_invoice: 50,
        allow_with_promotion: false,
    },
    expiry_months: 12,
    milestones: [
        { points: 10, value_vnd: 5000 },
        { points: 20, value_vnd: 15000 },
        { points: 50, value_vnd: 50000 },
    ],
};

function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
}

function normalizeLoyaltySettings(input = {}) {
    const cfg = deepClone(DEFAULT_LOYALTY_SETTINGS);
    const src = input || {};
    cfg.enabled = Boolean(src.enabled);

    const spend = Number(src?.earn?.spend_amount_vnd);
    const earnPoints = Number(src?.earn?.points);
    const minInvoice = Number(src?.earn?.min_invoice_amount_vnd);
    if (Number.isFinite(spend) && spend >= 1000) cfg.earn.spend_amount_vnd = Math.round(spend);
    if (Number.isFinite(earnPoints) && earnPoints >= 1) cfg.earn.points = Math.round(earnPoints);
    if (Number.isFinite(minInvoice) && minInvoice >= 0) cfg.earn.min_invoice_amount_vnd = Math.round(minInvoice);

    const pointValue = Number(src?.redeem?.point_value_vnd);
    const minPoints = Number(src?.redeem?.min_points);
    const maxPercent = Number(src?.redeem?.max_percent_per_invoice);
    if (Number.isFinite(pointValue) && pointValue >= 100) cfg.redeem.point_value_vnd = Math.round(pointValue);
    if (Number.isFinite(minPoints) && minPoints >= 1) cfg.redeem.min_points = Math.round(minPoints);
    if (Number.isFinite(maxPercent) && maxPercent >= 1 && maxPercent <= 90) cfg.redeem.max_percent_per_invoice = Math.round(maxPercent);
    if (src?.redeem?.allow_with_promotion !== undefined) {
        cfg.redeem.allow_with_promotion = Boolean(src.redeem.allow_with_promotion);
    }

    const expiryMonths = Number(src?.expiry_months);
    if (Number.isFinite(expiryMonths) && expiryMonths >= 1 && expiryMonths <= 36) {
        cfg.expiry_months = Math.round(expiryMonths);
    }

    const milestones = Array.isArray(src?.milestones) ? src.milestones : cfg.milestones;
    cfg.milestones = milestones
        .map((m) => ({ points: Math.round(Number(m?.points) || 0), value_vnd: Math.round(Number(m?.value_vnd) || 0) }))
        .filter((m) => m.points > 0 && m.value_vnd > 0)
        .sort((a, b) => a.points - b.points)
        .slice(0, 20);
    if (cfg.milestones.length === 0) {
        cfg.milestones = deepClone(DEFAULT_LOYALTY_SETTINGS.milestones);
    }

    return cfg;
}

function computeRedeemPlan({ totalAmount, requestedPoints = 0, currentPoints = 0, config, promoDiscount = 0 }) {
    const cfg = normalizeLoyaltySettings(config);
    const total = Math.max(0, Math.round(Number(totalAmount) || 0));
    const pointsAsked = Math.max(0, Math.round(Number(requestedPoints) || 0));
    const promo = Math.max(0, Math.round(Number(promoDiscount) || 0));
    if (!cfg.enabled || pointsAsked <= 0) {
        return { used_points: 0, redeem_value: 0, max_redeem_value: 0, reason: 'disabled_or_empty' };
    }
    if (promo > 0 && !cfg.redeem.allow_with_promotion) {
        return { used_points: 0, redeem_value: 0, max_redeem_value: 0, reason: 'promo_conflict' };
    }
    if (currentPoints < cfg.redeem.min_points) {
        return { used_points: 0, redeem_value: 0, max_redeem_value: 0, reason: 'min_points' };
    }
    const pointValue = cfg.redeem.point_value_vnd;
    const maxRedeemValue = Math.floor((total * cfg.redeem.max_percent_per_invoice) / 100);
    const requestedValue = pointsAsked * pointValue;
    const availableByBalance = Math.max(0, Math.floor(currentPoints));
    const cappedPoints = Math.min(pointsAsked, availableByBalance);
    const cappedValueByPoints = cappedPoints * pointValue;
    const appliedValue = Math.min(requestedValue, maxRedeemValue, cappedValueByPoints);
    const usedPoints = Math.floor(appliedValue / pointValue);
    return {
        used_points: usedPoints,
        redeem_value: usedPoints * pointValue,
        max_redeem_value: maxRedeemValue,
        reason: usedPoints > 0 ? 'ok' : 'capped',
    };
}

function computeEarnedPoints({ eligibleAmount, config }) {
    const cfg = normalizeLoyaltySettings(config);
    const eligible = Math.max(0, Math.round(Number(eligibleAmount) || 0));
    if (!cfg.enabled) return 0;
    if (eligible < cfg.earn.min_invoice_amount_vnd) return 0;
    const cycles = Math.floor(eligible / cfg.earn.spend_amount_vnd);
    return Math.max(0, cycles * cfg.earn.points);
}

function getNextNudge(currentPoints, milestonesInput = []) {
    const points = Math.max(0, Math.floor(Number(currentPoints) || 0));
    const milestones = (Array.isArray(milestonesInput) ? milestonesInput : [])
        .map((m) => ({ points: Number(m?.points) || 0, value_vnd: Number(m?.value_vnd) || 0 }))
        .filter((m) => m.points > 0 && m.value_vnd > 0)
        .sort((a, b) => a.points - b.points);
    const next = milestones.find((m) => m.points > points);
    if (!next) return null;
    return {
        points_needed: next.points - points,
        reward_value_vnd: next.value_vnd,
        next_milestone_points: next.points,
        progress_pct: Math.min(100, Math.floor((points / next.points) * 100)),
    };
}

async function appendLoyaltyTxn({
    customerId,
    storeId,
    actorId,
    type,
    points,
    valueVnd,
    referenceModel,
    referenceId,
    note = '',
    idempotencyKey = '',
}) {
    if (idempotencyKey) {
        const existed = await CustomerLoyaltyTransaction.findOne({
            customer_id: customerId,
            idempotency_key: idempotencyKey,
        }).lean();
        if (existed) return existed;
    }
    const customer = await Customer.findById(customerId).select(
        '_id store_id loyalty_points lifetime_points_earned lifetime_points_used last_loyalty_activity_at'
    );
    if (!customer) return null;
    if (storeId && customer.store_id && String(customer.store_id) !== String(storeId)) {
        throw new Error('STORE_CUSTOMER_MISMATCH');
    }
    const safeStoreId = storeId || customer.store_id || null;
    const nextBalance = Number(customer.loyalty_points || 0) + Number(points || 0);
    customer.loyalty_points = nextBalance;
    customer.last_loyalty_activity_at = new Date();
    if (points > 0) {
        customer.lifetime_points_earned = Number(customer.lifetime_points_earned || 0) + points;
    } else if (points < 0) {
        customer.lifetime_points_used = Number(customer.lifetime_points_used || 0) + Math.abs(points);
    }
    await customer.save();
    return CustomerLoyaltyTransaction.create({
        store_id: safeStoreId,
        customer_id: customerId,
        type,
        points,
        value_vnd: valueVnd,
        reference_model: referenceModel || '',
        reference_id: referenceId || null,
        balance_after: nextBalance,
        note,
        idempotency_key: idempotencyKey || '',
        created_by: actorId || null,
    });
}

module.exports = {
    DEFAULT_LOYALTY_SETTINGS,
    normalizeLoyaltySettings,
    computeRedeemPlan,
    computeEarnedPoints,
    getNextNudge,
    appendLoyaltyTxn,
};
