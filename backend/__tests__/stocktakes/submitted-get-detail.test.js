const mongoose = require('mongoose');
const request = require('supertest');
const express = require('express');
const stocktakeRoutes = require('../../routes/stocktakes');
const { createStaffWithStore, createManagerWithStore, getAuthHeader } = require('../fixtures/users');
const { createProducts } = require('../fixtures/products');

const app = express();
app.use(express.json());
app.use('/api/stocktakes', stocktakeRoutes);

describe('Submitted stocktake GET detail', () => {
  it('loads submitted stocktake detail without Cast to ObjectId error', async () => {
    const { manager, store } = await createManagerWithStore();
    const staff = await createStaffWithStore(store);
    const staffToken = getAuthHeader(staff).Authorization;
    const products = await createProducts(store._id, 1);
    const productIds = products.map((p) => p._id.toString());

    const createRes = await request(app)
      .post('/api/stocktakes')
      .set('Authorization', staffToken)
      .send({ product_ids: productIds });

    const stocktakeId = createRes.body.stocktake._id;

    await request(app)
      .patch(`/api/stocktakes/${stocktakeId}`)
      .set('Authorization', staffToken)
      .send({
        items: [{ product_id: productIds[0], actual_qty: 75 }],
        status: 'submitted',
      });

    const getRes = await request(app)
      .get(`/api/stocktakes/${stocktakeId}`)
      .set('Authorization', staffToken);

    expect(getRes.status).toBe(200);
    expect(getRes.body.stocktake.status).toBe('submitted');
    expect(getRes.body.stocktake.items[0].product_id.name).toBeDefined();
  });
});
