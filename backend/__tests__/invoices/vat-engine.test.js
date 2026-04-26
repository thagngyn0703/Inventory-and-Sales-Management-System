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

describe('vatEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('applies 10->8 reduction when eligible', async () => {
    TaxPolicy.findOne.mockReturnValueOnce(mockChain({
      _id: 'policy-1',
      version_code: 'VN-2025Q3',
      legal_basis_ref: 'NQ204/2025',
      strict_compliance: true,
      exclusion_rules: [],
    }));
    Store.findById.mockReturnValueOnce(mockChain({
      tax_rate: 10,
      price_includes_tax: true,
      business_type: 'doanh_nghiep',
    }));
    Product.find.mockReturnValueOnce(mockChain([
      { _id: 'p1', category_id: 'c1', vat_rate: 10, tax_override_enabled: true, tax_tags: [] },
    ]));
    Category.find.mockReturnValueOnce(mockChain([{ _id: 'c1', vat_rate: 10, tax_tags: [] }]));

    const out = await computeInvoiceTaxSnapshot({
      storeId: '67f3adf5f1a26a83e5b7f111',
      invoiceTaxPointAt: '2026-04-01T10:00:00.000Z',
      items: [{ product_id: 'p1', line_total: 108000 }],
      invoiceLevelDiscount: 0,
    });

    expect(out.items[0].base_rate).toBe(10);
    expect(out.items[0].final_rate).toBe(8);
    expect(out.items[0].reduction_reason_code).toBe('reduction_10_to_8');
    expect(out.tax_amount).toBeGreaterThan(0);
  });

  test('throws TAX_MAPPING_REQUIRED in strict mode when mapping missing', async () => {
    TaxPolicy.findOne.mockReturnValueOnce(mockChain({
      _id: 'policy-2',
      strict_compliance: true,
      exclusion_rules: [],
    }));
    Store.findById.mockReturnValueOnce(mockChain({
      tax_rate: null,
      price_includes_tax: true,
      business_type: 'doanh_nghiep',
    }));
    Product.find.mockReturnValueOnce(mockChain([
      { _id: 'p2', category_id: null, vat_rate: null, tax_override_enabled: false, tax_tags: [] },
    ]));
    Category.find.mockReturnValueOnce(mockChain([]));

    await expect(computeInvoiceTaxSnapshot({
      storeId: '67f3adf5f1a26a83e5b7f112',
      invoiceTaxPointAt: '2026-04-01T10:00:00.000Z',
      items: [{ product_id: 'p2', line_total: 100000 }],
      invoiceLevelDiscount: 0,
    })).rejects.toMatchObject({ code: 'TAX_MAPPING_REQUIRED' });
  });

  test('reverse calculation handles mixed basket with NO_VAT + VAT_8 + TTDB+VAT', async () => {
    TaxPolicy.findOne.mockReturnValueOnce(mockChain({
      _id: 'policy-3',
      version_code: 'VN-2026Q4',
      legal_basis_ref: 'Luat VAT + TTDB',
      strict_compliance: true,
      vat_reduction_rule: {
        eligible: true,
        reduced_rate: 8,
        effective_from: '2025-07-01T00:00:00.000Z',
        effective_to: '2026-12-31T23:59:59.999Z',
        excluded_categories: ['BEER_2026'],
        exclusion_rules: ['special_consumption_tax'],
      },
      tax_category_rules: {
        NO_VAT: { vat_rate: 0, excise_rate: 0, tax_status: 'not_subject' },
        BEER_2026: { vat_rate: 10, excise_rate: 65, tax_status: 'taxable' },
        VAT_10: { vat_rate: 10, excise_rate: 0, tax_status: 'taxable' },
      },
      exclusion_rules: [],
    }));
    Store.findById.mockReturnValueOnce(mockChain({
      tax_rate: 10,
      price_includes_tax: true,
      business_type: 'doanh_nghiep',
      default_tax_profile: 'VAT_10',
    }));
    Product.find.mockReturnValueOnce(mockChain([
      { _id: 'rice', category_id: 'food', vat_rate: 0, tax_override_enabled: false, tax_tags: [], tax_category: 'NO_VAT' },
      { _id: 'beer', category_id: 'drink', vat_rate: 10, tax_override_enabled: false, tax_tags: ['special_consumption_tax'], tax_category: 'BEER_2026' },
      { _id: 'household', category_id: 'goods', vat_rate: 10, tax_override_enabled: false, tax_tags: [], tax_category: 'VAT_10' },
    ]));
    Category.find.mockReturnValueOnce(mockChain([
      { _id: 'food', vat_rate: 0, tax_profile: 'NO_VAT', tax_tags: [] },
      { _id: 'drink', vat_rate: 10, tax_profile: 'BEER_2026', tax_tags: ['special_consumption_tax'] },
      { _id: 'goods', vat_rate: 10, tax_profile: 'VAT_10', tax_tags: [] },
    ]));

    const out = await computeInvoiceTaxSnapshot({
      storeId: '67f3adf5f1a26a83e5b7f113',
      invoiceTaxPointAt: '2026-10-01T10:00:00.000Z',
      items: [
        { product_id: 'rice', line_total: 100000 },
        { product_id: 'beer', line_total: 181500 },
        { product_id: 'household', line_total: 108000 },
      ],
      invoiceLevelDiscount: 0,
    });

    const rice = out.items.find((x) => x.product_id === 'rice');
    const beer = out.items.find((x) => x.product_id === 'beer');
    const household = out.items.find((x) => x.product_id === 'household');

    expect(rice.final_rate).toBe(0);
    expect(rice.line_tax_amount).toBe(0);

    expect(beer.final_rate).toBe(10);
    expect(beer.excise_rate_snapshot).toBe(65);
    expect(beer.line_subtotal_amount).toBe(100000);
    expect(beer.line_excise_amount).toBe(65000);
    expect(beer.line_vat_amount).toBe(16500);
    expect(beer.line_tax_amount).toBe(81500);

    expect(household.base_rate).toBe(10);
    expect(household.final_rate).toBe(8);
    expect(household.reduction_reason_code).toBe('reduction_10_to_8');
    expect(household.line_subtotal_amount).toBe(100000);
    expect(household.line_tax_amount).toBe(8000);

    const breakdown = out.tax_breakdown_by_category || [];
    expect(breakdown.some((b) => b.tax_category === 'BEER_2026')).toBe(true);
    expect(breakdown.some((b) => b.tax_category === 'VAT_10')).toBe(true);
    expect(breakdown.some((b) => b.tax_category === 'NO_VAT')).toBe(true);
    const lineTaxSum = out.items.reduce((s, it) => s + (it.line_tax_amount || 0), 0);
    expect(out.tax_amount).toBe(lineTaxSum);
  });

  test('applies VAT reduction on 2026-12-31 but not on 2027-01-01', async () => {
    const policy = {
      _id: 'policy-4',
      version_code: 'VN-2026Q4',
      strict_compliance: true,
      vat_reduction_rule: {
        eligible: true,
        reduced_rate: 8,
        effective_from: '2025-07-01T00:00:00.000Z',
        effective_to: '2026-12-31T23:59:59.999Z',
        excluded_categories: [],
        exclusion_rules: [],
      },
      tax_category_rules: {
        VAT_10: { vat_rate: 10, excise_rate: 0, tax_status: 'taxable' },
      },
      exclusion_rules: [],
    };
    TaxPolicy.findOne.mockReturnValueOnce(mockChain(policy));
    TaxPolicy.findOne.mockReturnValueOnce(mockChain(policy));
    Store.findById.mockReturnValueOnce(mockChain({
      tax_rate: 10,
      price_includes_tax: true,
      business_type: 'doanh_nghiep',
      default_tax_profile: 'VAT_10',
    }));
    Store.findById.mockReturnValueOnce(mockChain({
      tax_rate: 10,
      price_includes_tax: true,
      business_type: 'doanh_nghiep',
      default_tax_profile: 'VAT_10',
    }));
    Product.find.mockReturnValueOnce(mockChain([
      { _id: 'p1', category_id: 'c1', vat_rate: 10, tax_override_enabled: false, tax_tags: [], tax_category: 'VAT_10' },
    ]));
    Product.find.mockReturnValueOnce(mockChain([
      { _id: 'p1', category_id: 'c1', vat_rate: 10, tax_override_enabled: false, tax_tags: [], tax_category: 'VAT_10' },
    ]));
    Category.find.mockReturnValueOnce(mockChain([{ _id: 'c1', vat_rate: 10, tax_profile: 'VAT_10', tax_tags: [] }]));
    Category.find.mockReturnValueOnce(mockChain([{ _id: 'c1', vat_rate: 10, tax_profile: 'VAT_10', tax_tags: [] }]));

    const out2026 = await computeInvoiceTaxSnapshot({
      storeId: '67f3adf5f1a26a83e5b7f114',
      invoiceTaxPointAt: '2026-12-31T22:59:59.999Z',
      items: [{ product_id: 'p1', line_total: 108000 }],
      invoiceLevelDiscount: 0,
    });
    const out2027 = await computeInvoiceTaxSnapshot({
      storeId: '67f3adf5f1a26a83e5b7f114',
      invoiceTaxPointAt: '2027-01-01T00:00:00.000Z',
      items: [{ product_id: 'p1', line_total: 108000 }],
      invoiceLevelDiscount: 0,
    });

    expect(out2026.items[0].final_rate).toBe(8);
    expect(out2027.items[0].final_rate).toBe(10);
  });
});
