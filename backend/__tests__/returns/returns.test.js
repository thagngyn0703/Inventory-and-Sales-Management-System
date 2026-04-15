const { computeReturnTaxBreakdown } = require('../../routes/returns');

describe('Returns VAT helper', () => {
  it('should snapshot return subtotal/tax from invoice tax ratio', () => {
    const invoice = {
      total_amount: 110,
      subtotal_amount: 100,
      tax_amount: 10,
      tax_rate_snapshot: 10,
    };
    const result = computeReturnTaxBreakdown(110, invoice);
    expect(result.total_amount).toBe(110);
    expect(result.subtotal_amount).toBe(100);
    expect(result.tax_amount).toBe(10);
    expect(result.tax_rate_snapshot).toBe(10);
  });

  it('should fallback to gross as subtotal when invoice has no tax snapshot', () => {
    const invoice = {
      total_amount: 0,
      subtotal_amount: undefined,
      tax_rate_snapshot: 0,
    };
    const result = computeReturnTaxBreakdown(99000, invoice);
    expect(result.total_amount).toBe(99000);
    expect(result.subtotal_amount).toBe(99000);
    expect(result.tax_amount).toBe(0);
    expect(result.tax_rate_snapshot).toBe(0);
  });
});
