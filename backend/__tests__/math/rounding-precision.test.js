jest.mock('../../models/Product', () => ({ find: jest.fn() }));
jest.mock('../../models/Category', () => ({ find: jest.fn() }));
jest.mock('../../models/Store', () => ({ findById: jest.fn() }));
jest.mock('../../models/TaxPolicy', () => ({ findOne: jest.fn() }));

const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Store = require('../../models/Store');
const TaxPolicy = require('../../models/TaxPolicy');
const { computeInvoiceTaxSnapshot } = require('../../services/vatEngine');

function mockChain(result) {
  return {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

describe('Rounding precision and drift control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('line-level half-up keeps header tax equal to sum(line_tax)', async () => {
    TaxPolicy.findOne.mockReturnValueOnce(
      mockChain({
        _id: 'policy-round',
        version_code: 'VN-ROUND',
        strict_compliance: true,
        rounding_mode: 'half_up',
        vat_reduction_rule: { eligible: false },
        tax_category_rules: { VAT_10: { vat_rate: 10, excise_rate: 0 } },
        exclusion_rules: [],
      })
    );
    Store.findById.mockReturnValueOnce(
      mockChain({
        tax_rate: 10,
        price_includes_tax: false,
        business_type: 'doanh_nghiep',
        default_tax_profile: 'VAT_10',
      })
    );
    Product.find.mockReturnValueOnce(
      mockChain([
        { _id: 'p1', category_id: 'c1', tax_override_enabled: false, tax_tags: [], tax_category: 'VAT_10' },
        { _id: 'p2', category_id: 'c1', tax_override_enabled: false, tax_tags: [], tax_category: 'VAT_10' },
      ])
    );
    Category.find.mockReturnValueOnce(
      mockChain([{ _id: 'c1', vat_rate: 10, tax_profile: 'VAT_10', tax_tags: [] }])
    );

    const out = await computeInvoiceTaxSnapshot({
      storeId: '67f3adf5f1a26a83e5b7f221',
      invoiceTaxPointAt: '2026-09-10T10:00:00.000Z',
      items: [
        { product_id: 'p1', line_total: 10001 },
        { product_id: 'p2', line_total: 10002 },
      ],
      invoiceLevelDiscount: 0,
    });

    const lineTaxSum = out.items.reduce((sum, it) => sum + (it.line_tax_amount || 0), 0);
    expect(out.tax_amount).toBe(lineTaxSum);
    expect(out.items[0].line_tax_amount).toBe(1000);
    expect(out.items[1].line_tax_amount).toBe(1000);
  });

  test('reverse mode with 0.5 edge does not drift from gross total', async () => {
    TaxPolicy.findOne.mockReturnValueOnce(
      mockChain({
        _id: 'policy-round-reverse',
        version_code: 'VN-ROUND-REV',
        strict_compliance: true,
        rounding_mode: 'half_up',
        tax_category_rules: { VAT_10: { vat_rate: 10, excise_rate: 0 } },
        exclusion_rules: [],
      })
    );
    Store.findById.mockReturnValueOnce(
      mockChain({
        tax_rate: 10,
        price_includes_tax: true,
        business_type: 'doanh_nghiep',
        default_tax_profile: 'VAT_10',
      })
    );
    Product.find.mockReturnValueOnce(
      mockChain([{ _id: 'p3', category_id: 'c2', tax_override_enabled: false, tax_tags: [], tax_category: 'VAT_10' }])
    );
    Category.find.mockReturnValueOnce(
      mockChain([{ _id: 'c2', vat_rate: 10, tax_profile: 'VAT_10', tax_tags: [] }])
    );

    const out = await computeInvoiceTaxSnapshot({
      storeId: '67f3adf5f1a26a83e5b7f222',
      invoiceTaxPointAt: '2026-09-10T10:00:00.000Z',
      items: [{ product_id: 'p3', line_total: 11001 }],
      invoiceLevelDiscount: 0,
    });

    const line = out.items[0];
    const recomposed = (line.line_subtotal_amount || 0) + (line.line_tax_amount || 0);
    expect(recomposed).toBe(line.line_net_total);
    expect(out.subtotal_amount + out.tax_amount).toBe(11001);
  });
});

