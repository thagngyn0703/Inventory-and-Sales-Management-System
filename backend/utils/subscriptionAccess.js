const TRIAL_DAYS = 7;

const SUBSCRIPTION_PLANS = [
  {
    code: 'monthly',
    name: 'Gói theo tháng',
    duration_months: 1,
    price_vnd: 100000,
  },
  {
    code: 'yearly',
    name: 'Gói theo năm',
    duration_months: 12,
    price_vnd: 1100000,
  },
];

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
}

async function getResolvedSubscriptionPlans() {
  try {
    const SubscriptionPricingSettings = require('../models/SubscriptionPricingSettings');
    const doc = await SubscriptionPricingSettings.findOne({ singleton_key: 'default' }).lean();
    const monthlyOverride =
      doc && Number.isFinite(Number(doc.monthly_price_vnd)) ? Math.round(Number(doc.monthly_price_vnd)) : null;
    const yearlyOverride =
      doc && Number.isFinite(Number(doc.yearly_price_vnd)) ? Math.round(Number(doc.yearly_price_vnd)) : null;
    return SUBSCRIPTION_PLANS.map((p) => {
      if (p.code === 'monthly' && monthlyOverride != null && monthlyOverride >= 0) {
        return { ...p, price_vnd: monthlyOverride };
      }
      if (p.code === 'yearly' && yearlyOverride != null && yearlyOverride >= 0) {
        return { ...p, price_vnd: yearlyOverride };
      }
      return { ...p };
    });
  } catch (err) {
    console.error('getResolvedSubscriptionPlans', err);
    return SUBSCRIPTION_PLANS.map((p) => ({ ...p }));
  }
}

async function getPlanByCode(planCode) {
  const plans = await getResolvedSubscriptionPlans();
  return plans.find((p) => p.code === String(planCode || '').toLowerCase()) || null;
}

function evaluateStoreSubscription(store) {
  if (!store) {
    return {
      status: 'expired',
      is_access_allowed: false,
      reason_code: 'STORE_NOT_FOUND',
    };
  }

  const now = new Date();
  const trialEndsAt = store.trial_ends_at ? new Date(store.trial_ends_at) : addDays(store.createdAt || now, TRIAL_DAYS);
  const subEndsAt = store.subscription_ends_at ? new Date(store.subscription_ends_at) : null;
  const subStartsAt = store.subscription_started_at ? new Date(store.subscription_started_at) : null;

  if (subEndsAt && subEndsAt > now) {
    return {
      status: 'active',
      is_access_allowed: true,
      plan_code: store.current_plan_code || '',
      trial_ends_at: trialEndsAt,
      subscription_started_at: subStartsAt,
      subscription_ends_at: subEndsAt,
      days_left: Math.ceil((subEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      reason_code: null,
    };
  }

  if (trialEndsAt > now) {
    return {
      status: 'trialing',
      is_access_allowed: true,
      trial_ends_at: trialEndsAt,
      subscription_started_at: subStartsAt,
      subscription_ends_at: subEndsAt,
      days_left: Math.ceil((trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      reason_code: null,
    };
  }

  return {
    status: 'expired',
    is_access_allowed: false,
    plan_code: store.current_plan_code || '',
    trial_ends_at: trialEndsAt,
    subscription_started_at: subStartsAt,
    subscription_ends_at: subEndsAt,
    days_left: 0,
    reason_code: 'SUBSCRIPTION_REQUIRED',
  };
}

module.exports = {
  TRIAL_DAYS,
  SUBSCRIPTION_PLANS,
  getResolvedSubscriptionPlans,
  addDays,
  addMonths,
  getPlanByCode,
  evaluateStoreSubscription,
};
