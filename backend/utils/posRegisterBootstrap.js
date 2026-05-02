const PosRegister = require('../models/PosRegister');
const ShiftSession = require('../models/ShiftSession');

/**
 * Đảm bảo cửa hàng có ít nhất hai quầy mặc định; gán ca đang mở cũ (không có register_id) về Quầy 1.
 * Idempotent — gọi được trước thao tác ca / hóa đơn.
 */
async function ensureRegistersAndMigrateLegacyOpenShift(storeId) {
    if (!storeId) return { registers: [] };

    let registers = await PosRegister.find({ store_id: storeId, is_active: true }).sort({ sort_order: 1, _id: 1 }).lean();
    if (registers.length === 0) {
        const isTest = String(process.env.NODE_ENV || '').toLowerCase() === 'test';
        if (isTest) {
            await PosRegister.create({ store_id: storeId, name: 'Quầy 1', sort_order: 1, is_active: true });
        } else {
            await PosRegister.insertMany([
                { store_id: storeId, name: 'Quầy 1', sort_order: 1, is_active: true },
                { store_id: storeId, name: 'Quầy 2', sort_order: 2, is_active: true },
            ]);
        }
        registers = await PosRegister.find({ store_id: storeId, is_active: true }).sort({ sort_order: 1, _id: 1 }).lean();
    }

    const firstId = registers[0]?._id;
    if (firstId) {
        await ShiftSession.updateMany(
            {
                store_id: storeId,
                status: 'open',
                $or: [{ register_id: null }, { register_id: { $exists: false } }],
            },
            { $set: { register_id: firstId } }
        );
    }

    return { registers };
}

module.exports = {
    ensureRegistersAndMigrateLegacyOpenShift,
};
