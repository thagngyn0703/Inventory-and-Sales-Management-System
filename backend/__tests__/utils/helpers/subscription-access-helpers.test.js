/**
 * Subscription Access - Function Unit Tests
 * Tests pure functions from utils/subscriptionAccess.js
 *
 * Format: Condition / Value / Confirm: Return / Exception / Log Message / Result type (N/A/B)
 */

const {
  TRIAL_DAYS,
  SUBSCRIPTION_PLANS,
  addDays,
  addMonths,
  evaluateStoreSubscription,
} = require('../../../utils/subscriptionAccess');

// ==================== Constants ====================
describe('SUBSCRIPTION_PLANS / TRIAL_DAYS', () => {
  it('CONST-001: TRIAL_DAYS = 7', () => {
    expect(TRIAL_DAYS).toBe(7);
  });

  it('CONST-002: SUBSCRIPTION_PLANS has monthly + yearly', () => {
    const codes = SUBSCRIPTION_PLANS.map((p) => p.code);
    expect(codes).toContain('monthly');
    expect(codes).toContain('yearly');
  });

  it('CONST-003: monthly plan has correct duration', () => {
    const monthly = SUBSCRIPTION_PLANS.find((p) => p.code === 'monthly');
    expect(monthly.duration_months).toBe(1);
  });

  it('CONST-004: yearly plan has correct duration', () => {
    const yearly = SUBSCRIPTION_PLANS.find((p) => p.code === 'yearly');
    expect(yearly.duration_months).toBe(12);
  });
});

// ==================== addDays ====================
describe('addDays(date, days)', () => {
  // [N] add positive days
  it('AD-001: add 5 days to 2024-01-01', () => {
    const r = addDays(new Date('2024-01-01T00:00:00Z'), 5);
    expect(r.toISOString().startsWith('2024-01-06')).toBe(true);
  });

  // [N] add 0 days
  it('AD-002: add 0 days => same date', () => {
    const base = new Date('2024-06-15T10:00:00Z');
    const r = addDays(base, 0);
    expect(r.getTime()).toBe(base.getTime());
  });

  // [N] negative days subtracts
  it('AD-003: -3 days subtracts', () => {
    const r = addDays(new Date('2024-01-10T00:00:00Z'), -3);
    expect(r.toISOString().startsWith('2024-01-07')).toBe(true);
  });

  // [B] cross month boundary
  it('AD-004: cross month boundary', () => {
    const r = addDays(new Date('2024-01-30T00:00:00Z'), 5);
    expect(r.toISOString().startsWith('2024-02-04')).toBe(true);
  });

  // [B] cross year boundary
  it('AD-005: cross year', () => {
    const r = addDays(new Date('2024-12-30T00:00:00Z'), 5);
    expect(r.toISOString().startsWith('2025-01-04')).toBe(true);
  });

  // [A] null days => same date
  it('AD-006: null days => same date', () => {
    const base = new Date('2024-06-15T00:00:00Z');
    const r = addDays(base, null);
    expect(r.getTime()).toBe(base.getTime());
  });

  // [A] undefined days
  it('AD-007: undefined days => same date', () => {
    const base = new Date('2024-06-15T00:00:00Z');
    const r = addDays(base, undefined);
    expect(r.getTime()).toBe(base.getTime());
  });

  // [N] does not mutate input
  it('AD-008: input not mutated', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const baseTs = base.getTime();
    addDays(base, 10);
    expect(base.getTime()).toBe(baseTs);
  });
});

// ==================== addMonths ====================
describe('addMonths(date, months)', () => {
  // [N] add 1 month
  it('AM-001: add 1 month', () => {
    const r = addMonths(new Date('2024-01-15T00:00:00Z'), 1);
    expect(r.getMonth()).toBe(1);
  });

  // [N] add 12 months
  it('AM-002: add 12 months => next year', () => {
    const r = addMonths(new Date('2024-06-01T00:00:00Z'), 12);
    expect(r.getFullYear()).toBe(2025);
  });

  // [N] add 0
  it('AM-003: 0 months => same', () => {
    const base = new Date('2024-06-15T00:00:00Z');
    const r = addMonths(base, 0);
    expect(r.getTime()).toBe(base.getTime());
  });

  // [A] negative months
  it('AM-004: -2 months subtracts', () => {
    const r = addMonths(new Date('2024-06-15T00:00:00Z'), -2);
    expect(r.getMonth()).toBe(3); // April
  });

  // [B] null months
  it('AM-005: null months => same', () => {
    const base = new Date('2024-06-15T00:00:00Z');
    const r = addMonths(base, null);
    expect(r.getTime()).toBe(base.getTime());
  });

  // [N] does not mutate
  it('AM-006: input not mutated', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const ts = base.getTime();
    addMonths(base, 6);
    expect(base.getTime()).toBe(ts);
  });
});

// ==================== evaluateStoreSubscription ====================
describe('evaluateStoreSubscription(store)', () => {
  // [A] null store
  it('ESS-001: null store => expired + STORE_NOT_FOUND', () => {
    const r = evaluateStoreSubscription(null);
    expect(r.status).toBe('expired');
    expect(r.is_access_allowed).toBe(false);
    expect(r.reason_code).toBe('STORE_NOT_FOUND');
  });

  // [A] undefined store
  it('ESS-002: undefined store => expired', () => {
    const r = evaluateStoreSubscription(undefined);
    expect(r.status).toBe('expired');
    expect(r.is_access_allowed).toBe(false);
  });

  // [N] active subscription not yet ended
  it('ESS-003: active sub future end => active', () => {
    const future = new Date(Date.now() + 30 * 86400000);
    const past = new Date(Date.now() - 5 * 86400000);
    const r = evaluateStoreSubscription({
      subscription_ends_at: future,
      subscription_started_at: past,
      current_plan_code: 'monthly',
      createdAt: past,
    });
    expect(r.status).toBe('active');
    expect(r.is_access_allowed).toBe(true);
    expect(r.plan_code).toBe('monthly');
    expect(r.days_left).toBeGreaterThan(0);
  });

  // [N] within trial
  it('ESS-004: trialing within trial window => trialing', () => {
    const futureTrial = new Date(Date.now() + 3 * 86400000);
    const r = evaluateStoreSubscription({
      trial_ends_at: futureTrial,
      createdAt: new Date(Date.now() - 4 * 86400000),
    });
    expect(r.status).toBe('trialing');
    expect(r.is_access_allowed).toBe(true);
    expect(r.days_left).toBeGreaterThan(0);
  });

  // [A] trial expired no sub
  it('ESS-005: trial + sub both past => expired', () => {
    const past = new Date(Date.now() - 30 * 86400000);
    const r = evaluateStoreSubscription({
      createdAt: new Date(Date.now() - 100 * 86400000),
      trial_ends_at: past,
    });
    expect(r.status).toBe('expired');
    expect(r.is_access_allowed).toBe(false);
    expect(r.reason_code).toBe('SUBSCRIPTION_REQUIRED');
  });

  // [B] subscription_ends_at exactly now => fall through to trial check
  it('ESS-006: sub_ends_at past => check trial', () => {
    const future = new Date(Date.now() + 5 * 86400000);
    const past = new Date(Date.now() - 1 * 86400000);
    const r = evaluateStoreSubscription({
      subscription_ends_at: past,
      trial_ends_at: future,
      createdAt: new Date(Date.now() - 1 * 86400000),
    });
    expect(r.status).toBe('trialing');
  });

  // [N] expired sub + expired trial => expired with plan_code preserved
  it('ESS-007: expired sub keeps plan_code', () => {
    const past = new Date(Date.now() - 30 * 86400000);
    const r = evaluateStoreSubscription({
      subscription_ends_at: past,
      trial_ends_at: past,
      current_plan_code: 'yearly',
      createdAt: new Date(Date.now() - 365 * 86400000),
    });
    expect(r.status).toBe('expired');
    expect(r.plan_code).toBe('yearly');
  });

  // [B] no trial_ends_at uses createdAt + TRIAL_DAYS
  it('ESS-008: no trial_ends_at => derived from createdAt', () => {
    const recentCreate = new Date(Date.now() - 1 * 86400000); // 1 day ago
    const r = evaluateStoreSubscription({
      createdAt: recentCreate,
    });
    // 7 trial days from createdAt, so still trialing
    expect(r.status).toBe('trialing');
  });

  // [B] active subscription gives days_left rounded up
  it('ESS-009: days_left ceil-ed', () => {
    const future = new Date(Date.now() + 10 * 86400000 + 5000);
    const r = evaluateStoreSubscription({
      subscription_ends_at: future,
      createdAt: new Date(),
    });
    expect(r.days_left).toBeGreaterThanOrEqual(10);
    expect(r.days_left).toBeLessThanOrEqual(11);
  });
});
