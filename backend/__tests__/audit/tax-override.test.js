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

describe('Tax override audit trail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('keeps override reason and source in invoice line snapshot', async () => {
    TaxPolicy.findOne.mockReturnValueOnce(
      mockChain({
        _id: 'policy-override',
        version_code: 'VN-2026Q4',
        strict_compliance: true,
        legal_basis_ref: 'Luat 48/2024/QH15',
        tax_category_rules: {},
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
      mockChain([
        {
          _id: 'p-override',
          category_id: 'c-1',
          vat_rate: 5,
          tax_override_enabled: true,
          tax_override_reason: 'Manager approved special treatment',
          tax_tags: [],
          tax_category: 'VAT_5',
        },
      ])
    );
    Category.find.mockReturnValueOnce(
      mockChain([
        { _id: 'c-1', vat_rate: 10, tax_profile: 'VAT_10', tax_tags: [] },
      ])
    );

    const out = await computeInvoiceTaxSnapshot({
      storeId: '67f3adf5f1a26a83e5b7f220',
      invoiceTaxPointAt: '2026-10-10T12:00:00.000Z',
      items: [{ product_id: 'p-override', line_total: 105000 }],
      invoiceLevelDiscount: 0,
    });

    expect(out.items).toHaveLength(1);
    expect(out.items[0].rate_source).toBe('product_override');
    expect(out.items[0].base_rate).toBe(5);
    expect(out.items[0].vat_rate_snapshot).toBe(5);
    expect(out.items[0].tax_override_reason_snapshot).toBe(
      'Manager approved special treatment'
    );
  });
});

