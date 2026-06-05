/**
 * Invoice Display Code Helpers - Function Unit Tests (pure)
 * Covers: buildInvoiceDisplayCode, decorateInvoiceDisplayCode, decorateInvoiceListDisplayCode, parseDisplayCode
 *
 * Format: Condition / Value / Confirm: Return / Exception / Log Message / Result type (N/A/B)
 */

const {
  buildInvoiceDisplayCode,
  decorateInvoiceDisplayCode,
  decorateInvoiceListDisplayCode,
  parseDisplayCode,
} = require('../../../utils/invoiceDisplayCode');

// ==================== buildInvoiceDisplayCode ====================
describe('buildInvoiceDisplayCode(invoice)', () => {
  // [N] invoice with invoice_at + _id
  it('BIDC-001: builds HDYYMMDD-XXXXXX from invoice_at', () => {
    const inv = {
      _id: '507f1f77bcf86cd799439abc',
      invoice_at: new Date('2026-05-26T10:00:00.000Z'),
    };
    const code = buildInvoiceDisplayCode(inv);
    expect(code).toMatch(/^HD\d{6}-[A-F0-9]{6}$/);
    expect(code.endsWith('439ABC')).toBe(true);
  });

  // [N] uses created_at when invoice_at missing
  it('BIDC-002: falls back to created_at', () => {
    const inv = {
      _id: 'aaaaaaaaaaaaaaaaaaaa1234',
      created_at: new Date('2024-01-15T00:00:00.000Z'),
    };
    const code = buildInvoiceDisplayCode(inv);
    expect(code.endsWith('AA1234')).toBe(true);
  });

  // [B] no _id => XXXXXX suffix
  it('BIDC-003: no _id => XXXXXX', () => {
    const code = buildInvoiceDisplayCode({ invoice_at: new Date('2024-01-01') });
    expect(code).toMatch(/-XXXXXX$/);
  });

  // [A] null invoice
  it('BIDC-004: null => HD-UNKNOWN', () => {
    expect(buildInvoiceDisplayCode(null)).toBe('HD-UNKNOWN');
  });

  // [A] non-object
  it('BIDC-005: string input => HD-UNKNOWN', () => {
    expect(buildInvoiceDisplayCode('abc')).toBe('HD-UNKNOWN');
  });

  // [A] number input
  it('BIDC-006: number => HD-UNKNOWN', () => {
    expect(buildInvoiceDisplayCode(123)).toBe('HD-UNKNOWN');
  });

  // [B] empty object => uses now()
  it('BIDC-007: empty object => valid HD code shape', () => {
    const code = buildInvoiceDisplayCode({});
    expect(code).toMatch(/^HD\d{6}-XXXXXX$/);
  });
});

// ==================== decorateInvoiceDisplayCode ====================
describe('decorateInvoiceDisplayCode(invoice)', () => {
  // [N] adds display_code field
  it('DIDC-001: adds display_code property', () => {
    const inv = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      invoice_at: new Date('2024-01-15'),
      total_amount: 100,
    };
    const r = decorateInvoiceDisplayCode(inv);
    expect(r.display_code).toBeDefined();
    expect(r.total_amount).toBe(100);
  });

  // [N] preserves other fields
  it('DIDC-002: preserves all fields', () => {
    const inv = { _id: 'x', invoice_at: new Date(), foo: 'bar', baz: 1 };
    const r = decorateInvoiceDisplayCode(inv);
    expect(r.foo).toBe('bar');
    expect(r.baz).toBe(1);
  });

  // [A] null input
  it('DIDC-003: null => null', () => {
    expect(decorateInvoiceDisplayCode(null)).toBeNull();
  });

  // [A] non-object
  it('DIDC-004: string passthrough', () => {
    expect(decorateInvoiceDisplayCode('abc')).toBe('abc');
  });

  // [B] empty object => still decorated
  it('DIDC-005: empty object => display_code added', () => {
    const r = decorateInvoiceDisplayCode({});
    expect(r.display_code).toBeDefined();
  });
});

// ==================== decorateInvoiceListDisplayCode ====================
describe('decorateInvoiceListDisplayCode(list)', () => {
  // [N] decorates each item
  it('DILDC-001: maps over list', () => {
    const list = [
      { _id: 'a', invoice_at: new Date('2024-01-01') },
      { _id: 'b', invoice_at: new Date('2024-01-02') },
    ];
    const r = decorateInvoiceListDisplayCode(list);
    expect(r).toHaveLength(2);
    expect(r[0].display_code).toBeDefined();
    expect(r[1].display_code).toBeDefined();
  });

  // [B] empty array
  it('DILDC-002: empty array => empty', () => {
    expect(decorateInvoiceListDisplayCode([])).toEqual([]);
  });

  // [A] null
  it('DILDC-003: null => empty', () => {
    expect(decorateInvoiceListDisplayCode(null)).toEqual([]);
  });

  // [A] undefined defaults
  it('DILDC-004: undefined defaults to []', () => {
    expect(decorateInvoiceListDisplayCode()).toEqual([]);
  });

  // [A] non-array
  it('DILDC-005: non-array => empty', () => {
    expect(decorateInvoiceListDisplayCode('invalid')).toEqual([]);
  });
});

// ==================== parseDisplayCode ====================
describe('parseDisplayCode(raw)', () => {
  // [N] valid uppercase
  it('PDC-001: valid HD260526-ABC123', () => {
    expect(parseDisplayCode('HD260526-ABC123')).toEqual({
      yy: '26',
      mm: '05',
      dd: '26',
      suffix: 'ABC123',
      normalized: 'HD260526-ABC123',
    });
  });

  // [N] lowercase normalized
  it('PDC-002: lowercase => uppercased', () => {
    const r = parseDisplayCode('hd260526-abc123');
    expect(r.normalized).toBe('HD260526-ABC123');
  });

  // [N] trims spaces
  it('PDC-003: trims surrounding spaces', () => {
    const r = parseDisplayCode('  HD260526-ABC123  ');
    expect(r.normalized).toBe('HD260526-ABC123');
  });

  // [A] invalid format
  it('PDC-004: invalid format => null', () => {
    expect(parseDisplayCode('INVALID')).toBeNull();
  });

  // [A] missing HD prefix
  it('PDC-005: missing HD => null', () => {
    expect(parseDisplayCode('260526-ABC123')).toBeNull();
  });

  // [A] suffix too short
  it('PDC-006: short suffix => null', () => {
    expect(parseDisplayCode('HD260526-ABC')).toBeNull();
  });

  // [A] suffix non-hex
  it('PDC-007: suffix with non-hex => null', () => {
    expect(parseDisplayCode('HD260526-XYZ123')).toBeNull();
  });

  // [B] empty
  it('PDC-008: empty => null', () => {
    expect(parseDisplayCode('')).toBeNull();
  });

  // [B] null
  it('PDC-009: null => null', () => {
    expect(parseDisplayCode(null)).toBeNull();
  });

  // [B] undefined
  it('PDC-010: undefined => null', () => {
    expect(parseDisplayCode(undefined)).toBeNull();
  });
});
