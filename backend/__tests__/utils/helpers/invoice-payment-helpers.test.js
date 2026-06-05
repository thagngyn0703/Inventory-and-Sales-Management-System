/**
 * Invoice Payment Helpers - Function Unit Tests
 * Tests pure functions from utils/invoicePaymentUtils.js
 *
 * Format: Condition / Value / Confirm: Return / Exception / Log Message / Result type (N/A/B)
 */

const {
  normalizeNonNegativeInt,
  sumPayment,
  normalizeInvoicePayment,
} = require('../../../utils/invoicePaymentUtils');

// ==================== normalizeNonNegativeInt ====================
describe('normalizeNonNegativeInt(v)', () => {
  // [N] positive integer
  it('NNI-001: positive int => same', () => {
    expect(normalizeNonNegativeInt(100)).toBe(100);
  });

  // [N] positive float => rounded
  it('NNI-002: 99.6 => 100 (rounded)', () => {
    expect(normalizeNonNegativeInt(99.6)).toBe(100);
  });

  it('NNI-003: 99.4 => 99 (rounded)', () => {
    expect(normalizeNonNegativeInt(99.4)).toBe(99);
  });

  // [N] string number
  it('NNI-004: "150" => 150', () => {
    expect(normalizeNonNegativeInt('150')).toBe(150);
  });

  // [B] zero
  it('NNI-005: 0 => 0', () => {
    expect(normalizeNonNegativeInt(0)).toBe(0);
  });

  // [A] negative => 0
  it('NNI-006: -50 => 0', () => {
    expect(normalizeNonNegativeInt(-50)).toBe(0);
  });

  // [A] string negative
  it('NNI-007: "-100" => 0', () => {
    expect(normalizeNonNegativeInt('-100')).toBe(0);
  });

  // [A] non-numeric => 0
  it('NNI-008: "abc" => 0', () => {
    expect(normalizeNonNegativeInt('abc')).toBe(0);
  });

  // [B] null
  it('NNI-009: null => 0', () => {
    expect(normalizeNonNegativeInt(null)).toBe(0);
  });

  // [B] undefined
  it('NNI-010: undefined => 0', () => {
    expect(normalizeNonNegativeInt(undefined)).toBe(0);
  });

  // [B] empty string
  it('NNI-011: "" => 0', () => {
    expect(normalizeNonNegativeInt('')).toBe(0);
  });
});

// ==================== sumPayment ====================
describe('sumPayment(payment)', () => {
  // [N] valid cash + bank
  it('SP-001: cash 1000 + bank 500 => total 1500', () => {
    expect(sumPayment({ cash: 1000, bank_transfer: 500 })).toEqual({
      cash: 1000,
      bank_transfer: 500,
      total: 1500,
    });
  });

  // [N] cash only
  it('SP-002: cash only => total = cash', () => {
    expect(sumPayment({ cash: 2000, bank_transfer: 0 })).toEqual({
      cash: 2000,
      bank_transfer: 0,
      total: 2000,
    });
  });

  // [N] bank only
  it('SP-003: bank only', () => {
    expect(sumPayment({ cash: 0, bank_transfer: 3000 })).toEqual({
      cash: 0,
      bank_transfer: 3000,
      total: 3000,
    });
  });

  // [B] both zero
  it('SP-004: both 0 => total 0', () => {
    expect(sumPayment({ cash: 0, bank_transfer: 0 })).toEqual({
      cash: 0,
      bank_transfer: 0,
      total: 0,
    });
  });

  // [A] negative coerced to 0
  it('SP-005: negative cash coerced => 0', () => {
    expect(sumPayment({ cash: -100, bank_transfer: 200 })).toEqual({
      cash: 0,
      bank_transfer: 200,
      total: 200,
    });
  });

  // [A] missing fields
  it('SP-006: empty object => zeros', () => {
    expect(sumPayment({})).toEqual({ cash: 0, bank_transfer: 0, total: 0 });
  });

  // [B] null
  it('SP-007: null => zeros', () => {
    expect(sumPayment(null)).toEqual({ cash: 0, bank_transfer: 0, total: 0 });
  });

  // [B] undefined
  it('SP-008: undefined => zeros', () => {
    expect(sumPayment(undefined)).toEqual({ cash: 0, bank_transfer: 0, total: 0 });
  });

  // [N] float rounded
  it('SP-009: floats rounded', () => {
    expect(sumPayment({ cash: 100.6, bank_transfer: 50.4 })).toEqual({
      cash: 101,
      bank_transfer: 50,
      total: 151,
    });
  });
});

// ==================== normalizeInvoicePayment ====================
describe('normalizeInvoicePayment(args)', () => {
  // [N] payment provided, sum matches expected
  it('NIP-001: split match expected => ok', () => {
    const r = normalizeInvoicePayment({
      payment_method: 'cash',
      payment: { cash: 600, bank_transfer: 400 },
      expected_total: 1000,
    });
    expect(r.ok).toBe(true);
    expect(r.payment_method).toBe('split');
    expect(r.payment).toEqual({ cash: 600, bank_transfer: 400 });
  });

  // [N] only cash
  it('NIP-002: only cash => method cash', () => {
    const r = normalizeInvoicePayment({
      payment: { cash: 1000, bank_transfer: 0 },
      expected_total: 1000,
    });
    expect(r.ok).toBe(true);
    expect(r.payment_method).toBe('cash');
  });

  // [N] only bank
  it('NIP-003: only bank => method bank_transfer', () => {
    const r = normalizeInvoicePayment({
      payment: { cash: 0, bank_transfer: 1000 },
      expected_total: 1000,
    });
    expect(r.ok).toBe(true);
    expect(r.payment_method).toBe('bank_transfer');
  });

  // [A] mismatch sum
  it('NIP-004: sum mismatch => PAYMENT_SPLIT_INVALID', () => {
    const r = normalizeInvoicePayment({
      payment: { cash: 500, bank_transfer: 400 },
      expected_total: 1000,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('PAYMENT_SPLIT_INVALID');
    expect(r.expected_total).toBe(1000);
    expect(r.provided_total).toBe(900);
  });

  // [N] no payment + cash method (default)
  it('NIP-005: no payment + cash => infer cash full', () => {
    const r = normalizeInvoicePayment({
      payment_method: 'cash',
      expected_total: 500,
    });
    expect(r).toEqual({
      ok: true,
      payment_method: 'cash',
      payment: { cash: 500, bank_transfer: 0 },
    });
  });

  // [N] no payment + bank_transfer
  it('NIP-006: no payment + bank_transfer => infer bank full', () => {
    const r = normalizeInvoicePayment({
      payment_method: 'bank_transfer',
      expected_total: 800,
    });
    expect(r.payment_method).toBe('bank_transfer');
    expect(r.payment).toEqual({ cash: 0, bank_transfer: 800 });
  });

  // [N] card method
  it('NIP-007: card method preserved', () => {
    const r = normalizeInvoicePayment({
      payment_method: 'card',
      expected_total: 200,
    });
    expect(r.payment_method).toBe('card');
    expect(r.payment).toEqual({ cash: 0, bank_transfer: 200 });
  });

  // [N] credit method
  it('NIP-008: credit method preserved', () => {
    const r = normalizeInvoicePayment({
      payment_method: 'credit',
      expected_total: 300,
    });
    expect(r.payment_method).toBe('credit');
  });

  // [N] debt method
  it('NIP-009: debt => zero immediate', () => {
    const r = normalizeInvoicePayment({
      payment_method: 'debt',
      expected_total: 1000,
    });
    expect(r.ok).toBe(true);
    expect(r.payment_method).toBe('debt');
    expect(r.payment).toEqual({ cash: 0, bank_transfer: 0 });
  });

  // [B] allowZero true bypasses mismatch check
  it('NIP-010: allowZero true + mismatch => still ok', () => {
    const r = normalizeInvoicePayment({
      payment: { cash: 100, bank_transfer: 0 },
      expected_total: 500,
      allowZero: true,
    });
    expect(r.ok).toBe(true);
  });

  // [B] expected_total = 0 (debt invoice path)
  it('NIP-011: expected 0 + payment provided => no validation, ok', () => {
    const r = normalizeInvoicePayment({
      payment: { cash: 0, bank_transfer: 0 },
      expected_total: 0,
    });
    expect(r.ok).toBe(true);
    expect(r.payment_method).toBe('cash');
  });

  // [A] missing payment_method falls back to cash
  it('NIP-012: missing payment_method + no payment => cash default', () => {
    const r = normalizeInvoicePayment({ expected_total: 100 });
    expect(r.payment_method).toBe('cash');
    expect(r.payment.cash).toBe(100);
  });

  // [B] payment is non-object (string) => fall through to method inference
  it('NIP-013: payment string ignored => fall to method inference', () => {
    const r = normalizeInvoicePayment({
      payment: 'invalid',
      payment_method: 'cash',
      expected_total: 200,
    });
    expect(r.ok).toBe(true);
    expect(r.payment.cash).toBe(200);
  });
});
