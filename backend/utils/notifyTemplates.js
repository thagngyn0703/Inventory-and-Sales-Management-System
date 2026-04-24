/**
 * notifyTemplates.js
 * Xây dựng nội dung tin nhắn gửi đến khách hàng.
 * Không phụ thuộc vào DB — nhận payload đã có dữ liệu.
 */

function fmtVND(n) {
    return Number(n || 0).toLocaleString('vi-VN') + 'đ';
}

/**
 * Tin nhắn nhắc nợ.
 * @param {object} p
 * @param {string}  p.customerName
 * @param {string}  p.storeName
 * @param {number}  p.debtAmount       - Tổng nợ hiện tại
 * @param {number}  [p.overdueDays]    - Số ngày nợ lâu nhất (0 = chưa quá hạn)
 * @param {string}  [p.qrLink]         - Link VietQR hoặc link thanh toán
 * @param {string}  [p.storePhone]     - SĐT cửa hàng (tuỳ chọn)
 * @returns {string}
 */
function buildDebtReminderText({ customerName, storeName, debtAmount, overdueDays = 0, qrLink = '', storePhone = '' }) {
    const greeting = `Xin chào ${customerName || 'Anh/Chị'}`;
    const storeTag = storeName ? ` - ${storeName}` : '';
    const overdueNote =
        overdueDays > 0
            ? `\n⚠️ Đã quá hạn ${overdueDays} ngày, mong Anh/Chị ưu tiên thanh toán sớm.`
            : '';
    const qrNote = qrLink ? `\n💳 Chuyển khoản tại: ${qrLink}` : '';
    const contactNote = storePhone ? `\nLiên hệ: ${storePhone}` : '';

    return [
        `${greeting}${storeTag},`,
        `Đây là thông báo nhắc nhở: Anh/Chị hiện đang có số dư nợ là ${fmtVND(debtAmount)}.${overdueNote}`,
        `Vui lòng ghé cửa hàng hoặc thanh toán chuyển khoản để tránh phát sinh thêm.${qrNote}${contactNote}`,
        `Cảm ơn Anh/Chị đã tin tưởng mua hàng! 🙏`,
    ].join('\n');
}

/**
 * Tin nhắn cập nhật tích điểm sau mua hàng.
 * @param {object} p
 * @param {string}  p.customerName
 * @param {string}  p.storeName
 * @param {number}  p.earnedPoints     - Điểm vừa tích trong đơn này
 * @param {number}  p.currentPoints    - Tổng điểm hiện tại
 * @param {object}  [p.nextMilestone]  - { points_needed, value_vnd } — mốc tiếp theo
 * @param {number}  [p.redeemedPoints] - Điểm đã dùng (nếu có)
 * @returns {string}
 */
function buildLoyaltyUpdateText({ customerName, storeName, earnedPoints, currentPoints, nextMilestone = null, redeemedPoints = 0 }) {
    const name = customerName || 'Anh/Chị';
    const storeTag = storeName ? ` tại ${storeName}` : '';
    const lines = [`🎉 ${name} vừa tích thêm +${earnedPoints} điểm${storeTag}!`];

    if (redeemedPoints > 0) {
        lines.push(`💡 Đã dùng ${redeemedPoints} điểm để giảm giá đơn hàng.`);
    }

    lines.push(`⭐ Tổng điểm hiện tại: ${currentPoints} điểm.`);

    if (nextMilestone && nextMilestone.points_needed > 0) {
        lines.push(
            `🏆 Chỉ cần thêm ${nextMilestone.points_needed} điểm nữa là đổi được ${fmtVND(nextMilestone.value_vnd)}!`
        );
    }

    lines.push(`Cảm ơn Anh/Chị đã ủng hộ! 🙏`);
    return lines.join('\n');
}

/**
 * Chọn builder phù hợp với type.
 * @param {'DEBT_REMINDER'|'LOYALTY_UPDATE'} type
 * @param {object} payload
 * @returns {string}
 */
function renderMessageText(type, payload) {
    if (type === 'DEBT_REMINDER') return buildDebtReminderText(payload);
    if (type === 'LOYALTY_UPDATE') return buildLoyaltyUpdateText(payload);
    return '';
}

module.exports = {
    buildDebtReminderText,
    buildLoyaltyUpdateText,
    renderMessageText,
};
