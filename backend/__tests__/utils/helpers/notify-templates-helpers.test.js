/**
 * Notify Templates - Function Unit Tests
 * Tests pure functions from utils/notifyTemplates.js
 *
 * Format: Condition / Value / Confirm: Return / Exception / Log Message / Result type (N/A/B)
 */

const {
  buildDebtReminderText,
  buildLoyaltyUpdateText,
  renderMessageText,
} = require('../../../utils/notifyTemplates');

// ==================== buildDebtReminderText ====================
describe('buildDebtReminderText(payload)', () => {
  // [N] full payload
  it('BDR-001: full payload => contains greeting/store/debt', () => {
    const text = buildDebtReminderText({
      customerName: 'Anh Minh',
      storeName: 'Shop ABC',
      debtAmount: 500000,
      overdueDays: 5,
      qrLink: 'https://qr.io/abc',
      storePhone: '0901234567',
    });
    expect(text).toContain('Xin chào Anh Minh');
    expect(text).toContain('Shop ABC');
    expect(text).toContain('500.000đ');
    expect(text).toContain('Đã quá hạn 5 ngày');
    expect(text).toContain('https://qr.io/abc');
    expect(text).toContain('0901234567');
  });

  // [N] no overdue
  it('BDR-002: overdueDays 0 => no overdue line', () => {
    const text = buildDebtReminderText({
      customerName: 'A',
      storeName: 'S',
      debtAmount: 100000,
      overdueDays: 0,
    });
    expect(text).not.toContain('quá hạn');
  });

  // [B] missing customerName => default
  it('BDR-003: missing customerName => Anh/Chị fallback', () => {
    const text = buildDebtReminderText({
      storeName: 'S',
      debtAmount: 100000,
    });
    expect(text).toContain('Xin chào Anh/Chị');
  });

  // [B] no storeName
  it('BDR-004: no storeName => no dash separator', () => {
    const text = buildDebtReminderText({
      customerName: 'A',
      debtAmount: 100000,
    });
    expect(text).toMatch(/^Xin chào A,/);
  });

  // [N] no qrLink
  it('BDR-005: no qrLink => no QR line', () => {
    const text = buildDebtReminderText({
      customerName: 'A',
      debtAmount: 100000,
    });
    expect(text).not.toContain('Chuyển khoản tại');
  });

  // [N] no storePhone
  it('BDR-006: no storePhone => no contact line', () => {
    const text = buildDebtReminderText({
      customerName: 'A',
      debtAmount: 100000,
    });
    expect(text).not.toContain('Liên hệ:');
  });

  // [B] zero debt
  it('BDR-007: debt 0 => "0đ"', () => {
    const text = buildDebtReminderText({
      customerName: 'A',
      debtAmount: 0,
    });
    expect(text).toContain('0đ');
  });

  // [A] null debtAmount
  it('BDR-008: null debt => 0đ', () => {
    const text = buildDebtReminderText({
      customerName: 'A',
      debtAmount: null,
    });
    expect(text).toContain('0đ');
  });

  // [B] large amount Vietnamese formatting
  it('BDR-009: large amount uses vi-VN formatting', () => {
    const text = buildDebtReminderText({
      customerName: 'A',
      debtAmount: 1234567,
    });
    expect(text).toContain('1.234.567đ');
  });
});

// ==================== buildLoyaltyUpdateText ====================
describe('buildLoyaltyUpdateText(payload)', () => {
  // [N] full payload
  it('BLU-001: full payload => earn + redeem + milestone lines', () => {
    const text = buildLoyaltyUpdateText({
      customerName: 'Chị Hà',
      storeName: 'Shop XYZ',
      earnedPoints: 5,
      currentPoints: 25,
      redeemedPoints: 10,
      nextMilestone: { points_needed: 5, value_vnd: 50000 },
    });
    expect(text).toContain('Chị Hà');
    expect(text).toContain('+5 điểm');
    expect(text).toContain('tại Shop XYZ');
    expect(text).toContain('Đã dùng 10 điểm');
    expect(text).toContain('25 điểm');
    expect(text).toContain('5 điểm nữa');
    expect(text).toContain('50.000đ');
  });

  // [N] no redeem
  it('BLU-002: redeemedPoints 0 => no redeem line', () => {
    const text = buildLoyaltyUpdateText({
      customerName: 'A',
      storeName: 'S',
      earnedPoints: 1,
      currentPoints: 10,
      redeemedPoints: 0,
    });
    expect(text).not.toContain('Đã dùng');
  });

  // [N] no milestone
  it('BLU-003: nextMilestone null => no milestone line', () => {
    const text = buildLoyaltyUpdateText({
      customerName: 'A',
      storeName: 'S',
      earnedPoints: 1,
      currentPoints: 10,
      nextMilestone: null,
    });
    expect(text).not.toContain('Chỉ cần thêm');
  });

  // [B] milestone with 0 needed => skipped
  it('BLU-004: milestone points_needed=0 => skipped', () => {
    const text = buildLoyaltyUpdateText({
      customerName: 'A',
      storeName: 'S',
      earnedPoints: 1,
      currentPoints: 10,
      nextMilestone: { points_needed: 0, value_vnd: 5000 },
    });
    expect(text).not.toContain('Chỉ cần thêm');
  });

  // [B] missing customerName => fallback
  it('BLU-005: missing customerName => Anh/Chị', () => {
    const text = buildLoyaltyUpdateText({
      storeName: 'S',
      earnedPoints: 1,
      currentPoints: 5,
    });
    expect(text).toContain('Anh/Chị');
  });

  // [B] no storeName
  it('BLU-006: no storeName => no "tại {storeName}" tag', () => {
    const text = buildLoyaltyUpdateText({
      customerName: 'A',
      earnedPoints: 1,
      currentPoints: 5,
    });
    // Header line must not contain "tại " store-name marker.
    const headerLine = text.split('\n')[0];
    expect(headerLine).not.toMatch(/tại\s+\S+/);
  });
});

// ==================== renderMessageText ====================
describe('renderMessageText(type, payload)', () => {
  // [N] DEBT_REMINDER routes
  it('RMT-001: DEBT_REMINDER routes to debt builder', () => {
    const t = renderMessageText('DEBT_REMINDER', {
      customerName: 'A',
      debtAmount: 1000,
    });
    expect(t).toContain('số dư nợ');
  });

  // [N] LOYALTY_UPDATE routes
  it('RMT-002: LOYALTY_UPDATE routes to loyalty builder', () => {
    const t = renderMessageText('LOYALTY_UPDATE', {
      customerName: 'A',
      earnedPoints: 5,
      currentPoints: 10,
    });
    expect(t).toContain('+5 điểm');
  });

  // [A] unknown type
  it('RMT-003: unknown type => empty string', () => {
    expect(renderMessageText('UNKNOWN', {})).toBe('');
  });

  // [B] empty type
  it('RMT-004: empty string type => empty string', () => {
    expect(renderMessageText('', {})).toBe('');
  });

  // [B] null type
  it('RMT-005: null type => empty string', () => {
    expect(renderMessageText(null, {})).toBe('');
  });
});
