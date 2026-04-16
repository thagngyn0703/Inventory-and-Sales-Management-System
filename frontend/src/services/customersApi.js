const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

async function parseResponse(res, defaultError) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw data || { message: defaultError };
    return data;
}

export const getCustomers = async ({ searchKey = '', status = '', is_regular = '', limit = 50, page = 1, has_debt = '' } = {}) => {
    try {
        const url = new URL(`${API_URL}/customers`);
        if (searchKey) url.searchParams.append('searchKey', searchKey);
        if (status) url.searchParams.append('status', status);
        if (is_regular !== '') url.searchParams.append('is_regular', is_regular);
        if (has_debt !== '') url.searchParams.append('has_debt', has_debt);
        url.searchParams.append('limit', limit);
        url.searchParams.append('page', page);

        const res = await fetch(url.toString(), {
            headers: getAuthHeaders(),
        });
        return await parseResponse(res, 'Lỗi khi tải danh sách khách hàng');
    } catch (err) {
        throw err;
    }
};

export const getStoreBankInfo = async () => {
    try {
        const res = await fetch(`${API_URL}/store-settings/bank`, {
            headers: getAuthHeaders(),
        });
        return await parseResponse(res, 'Lỗi khi tải thông tin ngân hàng');
    } catch (err) {
        return { bank_id: '', bank_account: '', bank_account_name: '' };
    }
};

export const createCustomer = async (data) => {
    try {
        const res = await fetch(`${API_URL}/customers`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        return await parseResponse(res, 'Lỗi khi tạo khách hàng');
    } catch (err) {
        throw err;
    }
};

export const getCustomer = async (id) => {
    try {
        const res = await fetch(`${API_URL}/customers/${id}`, {
            headers: getAuthHeaders(),
        });
        return await parseResponse(res, 'Lỗi khi lấy thông tin khách hàng');
    } catch (err) {
        throw err;
    }
};

export const updateCustomer = async (id, data) => {
    try {
        const res = await fetch(`${API_URL}/customers/${id}`, {
            method: 'PATCH',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        return await parseResponse(res, 'Lỗi khi cập nhật khách hàng');
    } catch (err) {
        throw err;
    }
};

export const payCustomerDebt = async (id, amount, paymentMethod = 'cash') => {
    try {
        const res = await fetch(`${API_URL}/customers/${id}/pay-debt`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ amount, payment_method: paymentMethod }),
        });
        return await parseResponse(res, 'Lỗi khi thanh toán nợ');
    } catch (err) {
        throw err;
    }
};

export const prepareCustomerDebtTransfer = async (id, amount) => {
    try {
        const res = await fetch(`${API_URL}/customers/${id}/pay-debt/prepare-transfer`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ amount }),
        });
        return await parseResponse(res, 'Lỗi khi tạo mã QR thu nợ');
    } catch (err) {
        throw err;
    }
};

export const confirmCustomerDebtTransfer = async (id, amount, paymentRef) => {
    try {
        const res = await fetch(`${API_URL}/customers/${id}/pay-debt/confirm-transfer`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ amount, payment_ref: paymentRef }),
        });
        return await parseResponse(res, 'Lỗi khi xác nhận chuyển khoản thu nợ');
    } catch (err) {
        throw err;
    }
};

export const cancelCustomerDebtTransfer = async (id, paymentRef) => {
    try {
        const res = await fetch(`${API_URL}/customers/${id}/pay-debt/cancel-transfer`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ payment_ref: paymentRef }),
        });
        return await parseResponse(res, 'Lỗi khi hủy yêu cầu chuyển khoản thu nợ');
    } catch (err) {
        throw err;
    }
};

export const getCustomerDebtPayments = async (id, limit = 100) => {
    try {
        const url = new URL(`${API_URL}/customers/${id}/debt-payments`);
        if (limit) url.searchParams.append('limit', limit);
        const res = await fetch(url.toString(), {
            headers: getAuthHeaders(),
        });
        return await parseResponse(res, 'Lỗi khi tải lịch sử thanh toán nợ');
    } catch (err) {
        throw err;
    }
};
