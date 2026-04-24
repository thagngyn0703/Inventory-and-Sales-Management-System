const mongoose = require('mongoose');
const Stocktake = require('../../models/Stocktake');

async function createTestStocktake(storeId, createdBy, overrides = {}) {
  const defaultData = {
    storeId,
    created_by: createdBy,
    status: 'draft',
    snapshot_at: new Date(),
    items: [],
    completed_at: null,
    reject_reason: '',
  };
  return Stocktake.create({ ...defaultData, ...overrides });
}

async function createStocktakeWithItems(storeId, createdBy, products, overrides = {}) {
  const items = products.map((product) => ({
    product_id: product._id,
    system_qty: product.stock_qty,
    actual_qty: product.stock_qty,
    variance: 0,
    reason: '',
  }));

  return createTestStocktake(storeId, createdBy, {
    items,
    ...overrides,
  });
}

async function createSubmittedStocktake(storeId, createdBy, products, overrides = {}) {
  const items = products.map((product, index) => {
    const actualQty = product.stock_qty + (index % 3 === 0 ? 5 : 0);
    return {
      product_id: product._id,
      system_qty: product.stock_qty,
      actual_qty: actualQty,
      variance: actualQty - product.stock_qty,
      reason: index % 3 === 0 ? 'Found extra stock' : '',
    };
  });

  return createTestStocktake(storeId, createdBy, {
    status: 'submitted',
    items,
    ...overrides,
  });
}

async function createCompletedStocktake(storeId, createdBy, products, overrides = {}) {
  const items = products.map((product) => ({
    product_id: product._id,
    system_qty: product.stock_qty,
    actual_qty: product.stock_qty + 3,
    variance: 3,
    reason: 'Adjustment',
  }));

  return createTestStocktake(storeId, createdBy, {
    status: 'completed',
    items,
    completed_at: new Date(),
    ...overrides,
  });
}

module.exports = {
  createTestStocktake,
  createStocktakeWithItems,
  createSubmittedStocktake,
  createCompletedStocktake,
};
