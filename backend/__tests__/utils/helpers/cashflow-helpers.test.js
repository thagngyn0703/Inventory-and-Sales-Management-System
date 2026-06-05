/**
 * Cashflow Helpers - Function Unit Tests
 * Tests pure helper functions from utils/cashflowUtils.js
 *
 * Format columns:
 *  - Condition (Precondition)
 *  - Value (Input)
 *  - Confirm: Return / Exception / Log Message
 *  - Result type: N (Normal) / A (Abnormal) / B (Boundary)
 */

const {
  mapPaymentMethodToCashFlow,
  normalizeCategory,
} = require('../../../utils/cashflowUtils');

// ==================== mapPaymentMethodToCashFlow ====================
describe('mapPaymentMethodToCashFlow(method)', () => {
  // [N] cash
  it('MPM-001: cash => CASH', () => {
    expect(mapPaymentMethodToCashFlow('cash')).toBe('CASH');
  });

  // [N] bank_transfer
  it('MPM-002: bank_transfer => BANK_TRANSFER', () => {
    expect(mapPaymentMethodToCashFlow('bank_transfer')).toBe('BANK_TRANSFER');
  });

  // [N] card
  it('MPM-003: card => BANK_TRANSFER', () => {
    expect(mapPaymentMethodToCashFlow('card')).toBe('BANK_TRANSFER');
  });

  // [N] credit
  it('MPM-004: credit => BANK_TRANSFER', () => {
    expect(mapPaymentMethodToCashFlow('credit')).toBe('BANK_TRANSFER');
  });

  // [N] e_wallet
  it('MPM-005: e_wallet => E_WALLET', () => {
    expect(mapPaymentMethodToCashFlow('e_wallet')).toBe('E_WALLET');
  });

  // [N] case-insensitive
  it('MPM-006: CASH (uppercase) => CASH', () => {
    expect(mapPaymentMethodToCashFlow('CASH')).toBe('CASH');
  });

  it('MPM-007: Bank_Transfer (mixed) => BANK_TRANSFER', () => {
    expect(mapPaymentMethodToCashFlow('Bank_Transfer')).toBe('BANK_TRANSFER');
  });

  // [A] unknown method
  it('MPM-008: unknown method => OTHER', () => {
    expect(mapPaymentMethodToCashFlow('crypto')).toBe('OTHER');
  });

  // [B] empty string
  it('MPM-009: empty string => OTHER', () => {
    expect(mapPaymentMethodToCashFlow('')).toBe('OTHER');
  });

  // [B] null
  it('MPM-010: null => OTHER', () => {
    expect(mapPaymentMethodToCashFlow(null)).toBe('OTHER');
  });

  // [B] undefined
  it('MPM-011: undefined => OTHER', () => {
    expect(mapPaymentMethodToCashFlow(undefined)).toBe('OTHER');
  });

  // [A] number coerced to string
  it('MPM-012: number 0 => OTHER', () => {
    expect(mapPaymentMethodToCashFlow(0)).toBe('OTHER');
  });
});

// ==================== normalizeCategory ====================
describe('normalizeCategory(category, type, isSystem)', () => {
  // [N] explicit category trim/uppercase
  it('NC-001: explicit lowercase category => trimmed uppercase', () => {
    expect(normalizeCategory('  sales_revenue  ', 'INCOME', true)).toBe('SALES_REVENUE');
  });

  it('NC-002: explicit category with type ignored', () => {
    expect(normalizeCategory('CUSTOM_CAT', 'EXPENSE', false)).toBe('CUSTOM_CAT');
  });

  // [N] empty category, INCOME, system
  it('NC-003: empty + INCOME + system => SYSTEM_INCOME', () => {
    expect(normalizeCategory('', 'INCOME', true)).toBe('SYSTEM_INCOME');
  });

  // [N] empty, EXPENSE, system
  it('NC-004: empty + EXPENSE + system => SYSTEM_EXPENSE', () => {
    expect(normalizeCategory('', 'EXPENSE', true)).toBe('SYSTEM_EXPENSE');
  });

  // [N] empty, INCOME, manual (not system)
  it('NC-005: empty + INCOME + manual => MANUAL_INCOME', () => {
    expect(normalizeCategory('', 'INCOME', false)).toBe('MANUAL_INCOME');
  });

  // [N] empty, EXPENSE, manual
  it('NC-006: empty + EXPENSE + manual => MANUAL_EXPENSE', () => {
    expect(normalizeCategory('', 'EXPENSE', false)).toBe('MANUAL_EXPENSE');
  });

  // [N] isSystem default false
  it('NC-007: empty + INCOME + isSystem default => MANUAL_INCOME', () => {
    expect(normalizeCategory('', 'INCOME')).toBe('MANUAL_INCOME');
  });

  // [N] type case-insensitive
  it('NC-008: type lowercase income => MANUAL_INCOME', () => {
    expect(normalizeCategory('', 'income', false)).toBe('MANUAL_INCOME');
  });

  // [B] null category
  it('NC-009: null category + INCOME + system => SYSTEM_INCOME', () => {
    expect(normalizeCategory(null, 'INCOME', true)).toBe('SYSTEM_INCOME');
  });

  // [B] undefined category
  it('NC-010: undefined category + EXPENSE => MANUAL_EXPENSE', () => {
    expect(normalizeCategory(undefined, 'EXPENSE', false)).toBe('MANUAL_EXPENSE');
  });

  // [A] unknown type defaults to EXPENSE branch
  it('NC-011: unknown type + system => SYSTEM_EXPENSE (fallback)', () => {
    expect(normalizeCategory('', 'TRANSFER', true)).toBe('SYSTEM_EXPENSE');
  });

  // [B] only spaces => empty after trim
  it('NC-012: spaces-only category => uses fallback', () => {
    expect(normalizeCategory('   ', 'INCOME', false)).toBe('MANUAL_INCOME');
  });
});
