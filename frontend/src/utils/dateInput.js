/**
 * Ngày tối thiểu cho input type="date" (YYYY-MM-DD, theo giờ local).
 */
export function minExpiryDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** true nếu chuỗi YYYY-MM-DD >= hôm nay */
export function isExpiryDateNotInPast(yyyyMmDd) {
    if (!yyyyMmDd || typeof yyyyMmDd !== 'string') return true;
    return yyyyMmDd >= minExpiryDateString();
}
