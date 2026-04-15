const TEXT_NO_SPECIAL_REGEX = /^[\p{L}\p{N}\s]+$/u;
const SKU_REGEX = /^[\p{L}\p{N},]+$/u;
const DIGITS_ONLY_REGEX = /^\d+$/;
const NUMBER_REGEX = /^\d+(\.\d+)?$/;

export function trimString(value) {
    return String(value ?? '').trim();
}

export function validateNoSpecialText(value, label, { required = false } = {}) {
    const trimmed = trimString(value);
    if (!trimmed) {
        if (required) return { ok: false, message: `${label} không được để trống.` };
        return { ok: true, value: '' };
    }
    if (!TEXT_NO_SPECIAL_REGEX.test(trimmed)) {
        return { ok: false, message: `${label} không được chứa ký tự đặc biệt.` };
    }
    return { ok: true, value: trimmed };
}

export function validateSku(value) {
    const trimmed = trimString(value);
    if (!trimmed) return { ok: false, message: 'SKU không được để trống.' };
    if (!SKU_REGEX.test(trimmed)) {
        return { ok: false, message: 'SKU chỉ được gồm chữ, số và dấu phẩy.' };
    }
    return { ok: true, value: trimmed };
}

export function validateBarcode(value) {
    const trimmed = trimString(value);
    if (!trimmed) return { ok: true, value: '' };
    if (!DIGITS_ONLY_REGEX.test(trimmed)) {
        return { ok: false, message: 'Barcode chỉ được nhập số, không chữ hoặc ký tự đặc biệt.' };
    }
    return { ok: true, value: trimmed };
}

export function validateNonNegativeNumber(value, label, { required = false } = {}) {
    const trimmed = trimString(value);
    if (!trimmed) {
        if (required) return { ok: false, message: `${label} không được để trống.` };
        return { ok: true, value: 0 };
    }
    if (!NUMBER_REGEX.test(trimmed)) {
        return { ok: false, message: `${label} phải là số hợp lệ, không chữ hoặc ký tự đặc biệt.` };
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
        return { ok: false, message: `${label} không được là số âm.` };
    }
    return { ok: true, value: num };
}
