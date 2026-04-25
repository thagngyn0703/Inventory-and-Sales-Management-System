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
});
