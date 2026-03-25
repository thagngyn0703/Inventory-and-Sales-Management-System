import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const getCustomers = async (searchKey = '', status = '', is_regular = '', limit = 50) => {
    try {
        const res = await axios.get(`${API_URL}/customers`, {
            params: { searchKey, status, is_regular, limit },
            headers: getAuthHeaders(),
        });
        return res.data;
    } catch (err) {
        throw err.response?.data || { message: 'Lỗi khi tải danh sách khách hàng' };
    }
};

export const createCustomer = async (data) => {
    try {
        const res = await axios.post(`${API_URL}/customers`, data, {
            headers: getAuthHeaders(),
        });
        return res.data;
    } catch (err) {
        throw err.response?.data || { message: 'Lỗi khi tạo khách hàng' };
    }
};

export const getCustomer = async (id) => {
    try {
        const res = await axios.get(`${API_URL}/customers/${id}`, {
            headers: getAuthHeaders(),
        });
        return res.data;
    } catch (err) {
        throw err.response?.data || { message: 'Lỗi khi lấy thông tin khách hàng' };
    }
};

export const updateCustomer = async (id, data) => {
    try {
        const res = await axios.patch(`${API_URL}/customers/${id}`, data, {
            headers: getAuthHeaders(),
        });
        return res.data;
    } catch (err) {
        throw err.response?.data || { message: 'Lỗi khi cập nhật khách hàng' };
    }
};
