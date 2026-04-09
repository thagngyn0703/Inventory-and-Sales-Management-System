const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

const Product = require('./backend/models/Product');
const ProductRequest = require('./backend/models/ProductRequest');

async function fix() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // Tìm các yêu cầu đã duyệt nhưng không rãnh mã cửa hàng (storeId)
        const requests = await ProductRequest.find({ status: 'approved' }).lean();
        console.log(`Found ${requests.length} approved requests.`);

        for (const req of requests) {
            if (!req.storeId) {
                console.log(`Skipping request for ${req.name} (no storeId in request)`);
                continue;
            }

            // Tìm sản phẩm tương ứng thiếu storeId
            const product = await Product.findOne({
                sku: req.sku,
                name: req.name,
                storeId: { $in: [null, undefined] }
            });

            if (product) {
                console.log(`Fixing product: ${product.name} (SKU: ${product.sku}) -> Store: ${req.storeId}`);
                product.storeId = req.storeId;
                await product.save();
            } else {
                console.log(`No matching orphaned product found for ${req.name}`);
            }
        }

        console.log('Done fixing.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

fix();
