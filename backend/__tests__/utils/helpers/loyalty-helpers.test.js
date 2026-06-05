/**
 * Loyalty Helpers - Function Unit Tests
 * Tests pure functions from utils/loyalty.js
 *
 * Format: Condition / Value / Confirm: Return / Exception / Log Message / Result type (N/A/B)
 */

const {
  DEFAULT_LOYALTY_SETTINGS,
  normalizeLoyaltySettings,
  computeRedeemPlan,
  computeEarnedPoints,
  getNextNudge,
} = require('../../../utils/loyalty');

// ==================== normalizeLoyaltySettings ====================
describe('normalizeLoyaltySettings(input)', () => {
  // [N] default when empty input
  it('NLS-001: empty object => defaults with enabled=false', () => {
    const cfg = normalizeLoyaltySettings({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.earn.spend_amount_vnd).toBe(20000);
    expect(cfg.earn.points).toBe(1);
    expect(cfg.redeem.point_value_vnd).toBe(500);
    expect(cfg.redeem.min_points).toBe(10);
    expect(cfg.expiry_months).toBe(12);
  });

  // [B] no input
  it('NLS-002: undefined input => defaults', () => {
    const cfg = normalizeLoyaltySettings();
    expect(cfg).toEqual(expect.objectContaining({ enabled: false }));
  });

  // [N] enabled true
  it('NLS-003: enabled true => preserved', () => {
    const cfg = normalizeLoyaltySettings({ enabled: true });
    expect(cfg.enabled).toBe(true);
  });

  // [N] earn override valid
  it('NLS-004: earn override valid', () => {
    const cfg = normalizeLoyaltySettings({
      earn: { spend_amount_vnd: 50000, points: 2, min_invoice_amount_vnd: 10000 },
    });
    expect(cfg.earn.spend_amount_vnd).toBe(50000);
    expect(cfg.earn.points).toBe(2);
    expect(cfg.earn.min_invoice_amount_vnd).toBe(10000);
  });

  // [A] earn spend below min => kept as default
  it('NLS-005: spend < 1000 => default kept', () => {
    const cfg = normalizeLoyaltySettings({ earn: { spend_amount_vnd: 500 } });
    expect(cfg.earn.spend_amount_vnd).toBe(20000);
  });

  // [A] earn points < 1 ignored
  it('NLS-006: earn points 0 ignored', () => {
    const cfg = normalizeLoyaltySettings({ earn: { points: 0 } });
    expect(cfg.earn.points).toBe(1);
  });

  // [N] redeem valid override
  it('NLS-007: redeem valid override', () => {
    const cfg = normalizeLoyaltySettings({
      redeem: { point_value_vnd: 1000, min_points: 5, max_percent_per_invoice: 30, allow_with_promotion: true },
    });
    expect(cfg.redeem.point_value_vnd).toBe(1000);
    expect(cfg.redeem.min_points).toBe(5);
    expect(cfg.redeem.max_percent_per_invoice).toBe(30);
    expect(cfg.redeem.allow_with_promotion).toBe(true);
  });

  // [B] max_percent above 90 ignored
  it('NLS-008: max_percent > 90 ignored', () => {
    const cfg = normalizeLoyaltySettings({ redeem: { max_percent_per_invoice: 95 } });
    expect(cfg.redeem.max_percent_per_invoice).toBe(50);
  });

  // [B] max_percent below 1 ignored
  it('NLS-009: max_percent 0 ignored', () => {
    const cfg = normalizeLoyaltySettings({ redeem: { max_percent_per_invoice: 0 } });
    expect(cfg.redeem.max_percent_per_invoice).toBe(50);
  });

  // [N] expiry valid
  it('NLS-010: expiry valid', () => {
    const cfg = normalizeLoyaltySettings({ expiry_months: 24 });
    expect(cfg.expiry_months).toBe(24);
  });

  // [B] expiry > 36 ignored
  it('NLS-011: expiry 50 ignored', () => {
    const cfg = normalizeLoyaltySettings({ expiry_months: 50 });
    expect(cfg.expiry_months).toBe(12);
  });

  // [N] milestones override sorted
  it('NLS-012: milestones sorted ascending', () => {
    const cfg = normalizeLoyaltySettings({
      milestones: [
        { points: 50, value_vnd: 5000 },
        { points: 10, value_vnd: 1000 },
      ],
    });
    expect(cfg.milestones[0].points).toBe(10);
    expect(cfg.milestones[1].points).toBe(50);
  });

  // [A] invalid milestones => defaults
  it('NLS-013: invalid milestones (zeros) => fallback defaults', () => {
    const cfg = normalizeLoyaltySettings({
      milestones: [{ points: 0, value_vnd: 0 }],
    });
    expect(cfg.milestones).toHaveLength(3);
  });

  // [A] non-array milestones => default kept
  it('NLS-014: milestones not array => uses default', () => {
    const cfg = normalizeLoyaltySettings({ milestones: 'invalid' });
    expect(cfg.milestones).toHaveLength(3);
  });

  // [B] more than 20 milestones => sliced
  it('NLS-015: > 20 milestones => sliced to 20', () => {
    const big = Array.from({ length: 25 }, (_, i) => ({ points: i + 1, value_vnd: 100 }));
    const cfg = normalizeLoyaltySettings({ milestones: big });
    expect(cfg.milestones).toHaveLength(20);
  });
});

// ==================== computeRedeemPlan ====================
describe('computeRedeemPlan(args)', () => {
  const enabledCfg = { enabled: true };

  // [A] disabled config
  it('CRP-001: disabled => zero', () => {
    const r = computeRedeemPlan({
      totalAmount: 100000,
      requestedPoints: 10,
      currentPoints: 100,
      config: { enabled: false },
    });
    expect(r.used_points).toBe(0);
    expect(r.reason).toBe('disabled_or_empty');
  });

  // [A] requested 0
  it('CRP-002: requestedPoints 0 => zero', () => {
    const r = computeRedeemPlan({
      totalAmount: 100000,
      requestedPoints: 0,
      currentPoints: 100,
      config: enabledCfg,
    });
    expect(r.used_points).toBe(0);
    expect(r.reason).toBe('disabled_or_empty');
  });

  // [A] promo conflict
  it('CRP-003: promo > 0 + allow_with_promotion false => promo_conflict', () => {
    const r = computeRedeemPlan({
      totalAmount: 100000,
      requestedPoints: 10,
      currentPoints: 100,
      config: enabledCfg,
      promoDiscount: 5000,
    });
    expect(r.reason).toBe('promo_conflict');
  });

  // [N] promo allowed
  it('CRP-004: promo allowed config => still computes', () => {
    const r = computeRedeemPlan({
      totalAmount: 100000,
      requestedPoints: 10,
      currentPoints: 100,
      config: { enabled: true, redeem: { allow_with_promotion: true } },
      promoDiscount: 5000,
    });
    expect(r.reason).toBe('ok');
    expect(r.used_points).toBe(10);
  });

  // [A] currentPoints below min_points
  it('CRP-005: currentPoints < min_points => min_points', () => {
    const r = computeRedeemPlan({
      totalAmount: 100000,
      requestedPoints: 5,
      currentPoints: 5,
      config: enabledCfg,
    });
    expect(r.reason).toBe('min_points');
  });

  // [N] normal redeem within limit
  it('CRP-006: normal redeem within max_percent', () => {
    const r = computeRedeemPlan({
      totalAmount: 100000,
      requestedPoints: 50,
      currentPoints: 100,
      config: enabledCfg,
    });
    expect(r.used_points).toBe(50);
    expect(r.redeem_value).toBe(25000);
    expect(r.max_redeem_value).toBe(50000);
    expect(r.reason).toBe('ok');
  });

  // [B] cap by max_redeem_value
  it('CRP-007: redeem capped by max_redeem_value (50%)', () => {
    const r = computeRedeemPlan({
      totalAmount: 10000,
      requestedPoints: 100,
      currentPoints: 200,
      config: enabledCfg,
    });
    // max = 50% of 10000 = 5000; pointValue 500 → 10 points
    expect(r.used_points).toBe(10);
    expect(r.redeem_value).toBe(5000);
    expect(r.max_redeem_value).toBe(5000);
  });

  // [B] cap by current balance
  it('CRP-008: cap by currentPoints balance', () => {
    const r = computeRedeemPlan({
      totalAmount: 1000000,
      requestedPoints: 200,
      currentPoints: 50,
      config: enabledCfg,
    });
    expect(r.used_points).toBeLessThanOrEqual(50);
  });

  // [B] zero total amount
  it('CRP-009: total 0 => max 0', () => {
    const r = computeRedeemPlan({
      totalAmount: 0,
      requestedPoints: 50,
      currentPoints: 100,
      config: enabledCfg,
    });
    expect(r.max_redeem_value).toBe(0);
    expect(r.used_points).toBe(0);
  });
});

// ==================== computeEarnedPoints ====================
describe('computeEarnedPoints(args)', () => {
  const enabledCfg = { enabled: true };

  // [A] disabled
  it('CEP-001: disabled => 0', () => {
    expect(computeEarnedPoints({ eligibleAmount: 100000, config: { enabled: false } })).toBe(0);
  });

  // [A] below min invoice amount
  it('CEP-002: amount below min_invoice_amount_vnd => 0', () => {
    expect(
      computeEarnedPoints({ eligibleAmount: 5000, config: enabledCfg })
    ).toBe(0);
  });

  // [N] one cycle
  it('CEP-003: 20000 => 1 point', () => {
    expect(computeEarnedPoints({ eligibleAmount: 20000, config: enabledCfg })).toBe(1);
  });

  // [N] multiple cycles
  it('CEP-004: 100000 => 5 points', () => {
    expect(computeEarnedPoints({ eligibleAmount: 100000, config: enabledCfg })).toBe(5);
  });

  // [B] partial cycle floored
  it('CEP-005: 25000 => 1 point (floor)', () => {
    expect(computeEarnedPoints({ eligibleAmount: 25000, config: enabledCfg })).toBe(1);
  });

  // [A] negative amount => 0
  it('CEP-006: negative => 0', () => {
    expect(computeEarnedPoints({ eligibleAmount: -100, config: enabledCfg })).toBe(0);
  });

  // [B] zero amount
  it('CEP-007: 0 => 0', () => {
    expect(computeEarnedPoints({ eligibleAmount: 0, config: enabledCfg })).toBe(0);
  });

  // [B] custom config
  it('CEP-008: custom config 50000 spend = 3 points', () => {
    expect(
      computeEarnedPoints({
        eligibleAmount: 150000,
        config: { enabled: true, earn: { spend_amount_vnd: 50000, points: 3, min_invoice_amount_vnd: 1000 } },
      })
    ).toBe(9);
  });
});

// ==================== getNextNudge ====================
describe('getNextNudge(currentPoints, milestones)', () => {
  const milestones = [
    { points: 10, value_vnd: 5000 },
    { points: 20, value_vnd: 15000 },
    { points: 50, value_vnd: 50000 },
  ];

  // [N] points below first milestone
  it('GNN-001: 5 points => next at 10', () => {
    const r = getNextNudge(5, milestones);
    expect(r.points_needed).toBe(5);
    expect(r.next_milestone_points).toBe(10);
    expect(r.reward_value_vnd).toBe(5000);
    expect(r.progress_pct).toBe(50);
  });

  // [N] between milestones
  it('GNN-002: 15 points => next at 20', () => {
    const r = getNextNudge(15, milestones);
    expect(r.points_needed).toBe(5);
    expect(r.next_milestone_points).toBe(20);
  });

  // [B] exactly at milestone => next is the one after
  it('GNN-003: 10 exactly => next at 20', () => {
    const r = getNextNudge(10, milestones);
    expect(r.next_milestone_points).toBe(20);
  });

  // [B] beyond max milestone => null
  it('GNN-004: 100 points => null', () => {
    expect(getNextNudge(100, milestones)).toBeNull();
  });

  // [A] empty milestones => null
  it('GNN-005: empty milestones => null', () => {
    expect(getNextNudge(5, [])).toBeNull();
  });

  // [B] non-array milestones => null
  it('GNN-006: non-array => null', () => {
    expect(getNextNudge(5, null)).toBeNull();
  });

  // [B] zero points
  it('GNN-007: 0 points => first milestone', () => {
    const r = getNextNudge(0, milestones);
    expect(r.points_needed).toBe(10);
    expect(r.progress_pct).toBe(0);
  });

  // [A] invalid milestones filtered out
  it('GNN-008: milestones with zero values filtered', () => {
    const r = getNextNudge(5, [
      { points: 0, value_vnd: 1000 },
      { points: 10, value_vnd: 5000 },
    ]);
    expect(r.next_milestone_points).toBe(10);
  });
});

// ==================== DEFAULT_LOYALTY_SETTINGS ====================
describe('DEFAULT_LOYALTY_SETTINGS', () => {
  it('DLS-001: has correct shape', () => {
    expect(DEFAULT_LOYALTY_SETTINGS).toEqual(
      expect.objectContaining({
        enabled: false,
        earn: expect.any(Object),
        redeem: expect.any(Object),
        expiry_months: 12,
        milestones: expect.any(Array),
      })
    );
  });
});
