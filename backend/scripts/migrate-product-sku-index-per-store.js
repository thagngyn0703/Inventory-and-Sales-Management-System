require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing in .env');
  await mongoose.connect(process.env.MONGO_URI);

  const indexes = await Product.collection.indexes();
  const skuUnique = indexes.find((i) => i.unique && i.key && i.key.sku === 1 && Object.keys(i.key).length === 1);
  if (skuUnique) {
    await Product.collection.dropIndex(skuUnique.name);
  }

  await Product.collection.createIndex({ storeId: 1, sku: 1 }, { unique: true, name: 'storeId_1_sku_1_unique' });

  const nextIndexes = await Product.collection.indexes();
  console.log(
    JSON.stringify(
      {
        droppedGlobalSkuUniqueIndex: Boolean(skuUnique),
        indexes: nextIndexes.map((i) => ({ name: i.name, key: i.key, unique: !!i.unique })),
      },
      null,
      2
    )
  );
}

run()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_) {}
  });

