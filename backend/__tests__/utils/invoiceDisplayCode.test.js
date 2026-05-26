const mongoose = require('mongoose');
const SalesInvoice = require('../../models/SalesInvoice');
const {
  buildInvoiceDisplayCode,
  parseDisplayCode,
  findInvoiceByLookupInput,
} = require('../../utils/invoiceDisplayCode');
const { createManagerWithStore } = require('../fixtures/users');
const { createTestProduct } = require('../fixtures/products');

describe('invoiceDisplayCode utils', () => {
  let store;
  let manager;

  beforeEach(async () => {
    const { store: s, manager: m } = await createManagerWithStore();
    store = s;
    manager = m;
  });

  it('parses display code format', () => {
    const parsed = parseDisplayCode('HD260526-ABC123');
    expect(parsed).toEqual({
      yy: '26',
      mm: '05',
      dd: '26',
      suffix: 'ABC123',
      normalized: 'HD260526-ABC123',
    });
  });

  it('finds invoice by display code without stored display_code field', async () => {
    const product = await createTestProduct(store._id, { stock_qty: 10 });
    const invoice = await SalesInvoice.create({
      store_id: store._id,
      created_by: manager._id,
      status: 'confirmed',
      payment_method: 'cash',
      payment_status: 'paid',
      invoice_at: new Date('2026-05-26T10:00:00.000Z'),
      items: [
        {
          product_id: product._id,
          quantity: 1,
          unit_price: 10000,
          line_total: 10000,
        },
      ],
      subtotal_amount: 10000,
      tax_amount: 0,
      total_amount: 10000,
    });

    const displayCode = buildInvoiceDisplayCode(invoice);
    const found = await findInvoiceByLookupInput(SalesInvoice, displayCode, { store_id: store._id });

    expect(found).toBeTruthy();
    expect(String(found._id)).toBe(String(invoice._id));
  });

  it('finds invoice by mongo id', async () => {
    const invoice = await SalesInvoice.create({
      store_id: store._id,
      created_by: manager._id,
      status: 'confirmed',
      payment_method: 'cash',
      payment_status: 'paid',
      invoice_at: new Date(),
      items: [],
      subtotal_amount: 0,
      tax_amount: 0,
      total_amount: 0,
    });

    const found = await findInvoiceByLookupInput(
      SalesInvoice,
      String(invoice._id),
      { store_id: store._id }
    );
    expect(String(found._id)).toBe(String(invoice._id));
  });
});
