import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Categories from './Categories';
import '@testing-library/jest-dom';

/**
 * MOCK SETUP - Thiết lập các mock cho external dependencies
 * Đảm bảo tests chạy độc lập, không phụ thuộc vào external APIs
 */

// Mock the ManagerSidebar component - Giả lập component con để tránh render thực
jest.mock('../ManagerDashboard/ManagerSidebar', () => {
    return function MockManagerSidebar() {
        return <div data-testid="manager-sidebar">Sidebar</div>;
    };
});

// Mock localStorage - Giả lập localStorage API của browser
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => {
            store[key] = value.toString();
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

/**
 * TEST SUITE - Bộ test chính cho Categories Component
 * Chứa tất cả test cases cho component Categories
 */
describe('Categories Component', () => {
    // Test data - Dữ liệu mẫu cho tests
    const mockToken = 'test-token';
    const mockCategories = [
        {
            _id: '1',
            name: 'Electronics',
            is_active: true,
            created_at: '2025-01-01T00:00:00Z',
        },
        {
            _id: '2',
            name: 'Clothing',
            is_active: false,
            created_at: '2025-01-02T00:00:00Z',
        },
        {
            _id: '3',
            name: 'Books',
            is_active: true,
            created_at: '2025-01-03T00:00:00Z',
        },
    ];

    // Setup trước mỗi test - Reset state
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('token', mockToken);
        global.fetch = jest.fn();
    });

    // Cleanup sau mỗi test - Clear mocks
    afterEach(() => {
        jest.clearAllMocks();
    });

    /**
     * INITIALIZATION AND FETCHING TESTS
     * Test việc khởi tạo component và fetch dữ liệu từ API
     */

    // Test 1: Kiểm tra component render đúng UI cơ bản
    // Setup: Mock API trả về danh sách categories thành công
    // Assertions: Sidebar, header title, subtitle hiển thị đúng
    it('should render the component with sidebar and header', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockCategories,
        });

        render(<Categories />);

        expect(screen.getByTestId('manager-sidebar')).toBeInTheDocument();
        expect(screen.getByText('Danh mục')).toBeInTheDocument();
        expect(screen.getByText('Quản lý danh mục sản phẩm')).toBeInTheDocument();
        // Wait for categories to load
        await screen.findByText('Electronics');
    });

    // Test 2: Kiểm tra component gọi API đúng endpoint khi mount
    // Setup: Mock API trả về categories, render component
    // Assertions: fetch được gọi với đúng URL và headers
    it('should fetch categories on mount', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockCategories,
        });

        render(<Categories />);

        await screen.findByText('Electronics');
        expect(global.fetch).toHaveBeenCalledWith(
            'http://localhost:8000/api/categories?all=true',
            {
                headers: { Authorization: `Bearer ${mockToken}` },
            }
        );
    });

    // Test 3: Kiểm tra loading state hiển thị khi đang fetch
    // Setup: Mock API không resolve (pending promise)
    // Assertions: Text "Đang tải..." hiển thị
    it('should display loading state while fetching', () => {
        global.fetch.mockImplementationOnce(() => new Promise(() => {}));

        render(<Categories />);

        expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    });

    // Test 4: Kiểm tra categories hiển thị sau khi fetch thành công
    // Setup: Mock API trả về mockCategories
    // Assertions: Tất cả 3 categories hiển thị đúng tên
    it('should display categories after fetching', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockCategories,
        });

        render(<Categories />);

        await screen.findByText('Electronics');
        expect(screen.getByText('Clothing')).toBeInTheDocument();
        expect(screen.getByText('Books')).toBeInTheDocument();
    });

    // Test 5: Kiểm tra error message hiển thị khi fetch thất bại
    // Setup: Mock API trả về ok: false với error message
    // Assertions: Error message hiển thị trên UI
    it('should display error message when fetch fails', async () => {
        const errorMessage = 'Không thể tải danh mục';
        global.fetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ message: errorMessage }),
        });

        render(<Categories />);

        await screen.findByText(errorMessage);
    });

    // Test 6: Kiểm tra empty state khi không có categories
    // Setup: Mock API trả về array rỗng
    // Assertions: Text "Chưa có danh mục." hiển thị
    it('should display empty state when no categories exist', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [],
        });

        render(<Categories />);

        await screen.findByText('Chưa có danh mục.');
    });

    describe('Create Category', () => {
        // Test 7: Kiểm tra modal tạo category mở khi click button
        // Setup: Render component, click "Thêm danh mục"
        // Assertions: Modal title và input field hiển thị
        it('should open create modal when button is clicked', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            // Wait for component to load categories first
            await waitFor(() => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
            });

            const createButton = screen.getByRole('button', { name: /Thêm danh mục/i });
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(screen.getByText('Tạo danh mục mới')).toBeInTheDocument();
            });
            expect(screen.getByPlaceholderText('Nhập tên danh mục')).toBeInTheDocument();
        });

        // Test 8: Kiểm tra modal đóng khi click cancel
        // Setup: Mở modal, click "Hủy"
        // Assertions: Modal không còn hiển thị
        it('should close create modal when cancel button is clicked', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            // Wait for component to load categories first
            await screen.findByText('Electronics');

            const createButton = screen.getByRole('button', { name: /Thêm danh mục/i });
            fireEvent.click(createButton);

            await screen.findByText('Tạo danh mục mới');

            const cancelButton = screen.getAllByText('Hủy')[0];
            fireEvent.click(cancelButton);

            expect(screen.queryByText('Tạo danh mục mới')).not.toBeInTheDocument();
        });

        // Test 9: Kiểm tra tạo category thành công
        // Setup: Mở modal, nhập tên, submit
        // Assertions: API được gọi với đúng payload, categories được refresh
        it('should create a new category successfully', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockCategories,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ _id: '4', name: 'New Category', is_active: true }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [...mockCategories, { _id: '4', name: 'New Category', is_active: true, created_at: new Date().toISOString() }],
                });

            render(<Categories />);

            await waitFor(() => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
            });

            const createButton = screen.getByRole('button', { name: /Thêm danh mục/i });
            fireEvent.click(createButton);

            const input = screen.getByPlaceholderText('Nhập tên danh mục');
            fireEvent.change(input, { target: { value: 'New Category' } });

            const submitButton = screen.getByRole('button', { name: 'Tạo' });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    'http://localhost:8000/api/categories',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${mockToken}`,
                        },
                        body: JSON.stringify({ name: 'New Category' }),
                    }
                );
            });
        });

        // Test 10: Kiểm tra button disabled khi input rỗng
        // Setup: Mở modal, không nhập gì
        // Assertions: Button "Tạo" bị disabled
        it('should disable create button when input is empty', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            // Wait for component to load categories first
            await screen.findByText('Electronics');

            const createButton = screen.getByRole('button', { name: /Thêm danh mục/i });
            fireEvent.click(createButton);

            const submitButton = await screen.findByRole('button', { name: 'Tạo' });
            expect(submitButton).toBeDisabled();
        });

        // Test 11: Kiểm tra error hiển thị khi tạo thất bại
        // Setup: Mock API trả về error khi tạo
        // Assertions: Error message hiển thị trên UI
        it('should display error when creation fails', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockCategories,
                })
                .mockResolvedValueOnce({
                    ok: false,
                    json: async () => ({ message: 'Tạo danh mục thất bại' }),
                });

            render(<Categories />);

            await waitFor(() => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
            });

            const createButton = screen.getByRole('button', { name: /Thêm danh mục/i });
            fireEvent.click(createButton);

            const input = screen.getByPlaceholderText('Nhập tên danh mục');
            fireEvent.change(input, { target: { value: 'New Category' } });

            const submitButton = screen.getByRole('button', { name: 'Tạo' });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText('Tạo danh mục thất bại')).toBeInTheDocument();
            });
        });
    });

    /**
     * EDIT CATEGORY TESTS
     * Test chức năng chỉnh sửa category
     */

    // Test 12: Kiểm tra modal edit mở khi click edit button
    // Setup: Click edit button của category đầu tiên
    // Assertions: Modal title và input với giá trị hiện tại hiển thị
    describe('Edit Category', () => {
        it('should open edit modal when edit button is clicked', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            await screen.findByText('Electronics');

            const editButtons = screen.getAllByLabelText('Sửa');
            fireEvent.click(editButtons[0]);

            await screen.findByText('Chỉnh sửa danh mục');
            expect(screen.getByDisplayValue('Electronics')).toBeInTheDocument();
        });

        // Test 13: Kiểm tra edit category thành công
        // Setup: Mở modal edit, thay đổi tên, submit
        // Assertions: API PUT được gọi với đúng payload
        it('should edit category successfully', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockCategories,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ _id: '1', name: 'Updated Electronics', is_active: true }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [
                        { ...mockCategories[0], name: 'Updated Electronics' },
                        ...mockCategories.slice(1),
                    ],
                });

            render(<Categories />);

            await screen.findByText('Electronics');

            const editButtons = screen.getAllByLabelText('Sửa');
            fireEvent.click(editButtons[0]);

            const input = screen.getByDisplayValue('Electronics');
            fireEvent.change(input, { target: { value: 'Updated Electronics' } });

            const saveButton = screen.getByRole('button', { name: 'Lưu' });
            fireEvent.click(saveButton);

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    'http://localhost:8000/api/categories/1',
                    {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${mockToken}`,
                        },
                        body: JSON.stringify({ name: 'Updated Electronics' }),
                    }
                );
            });
        });

        // Test 14: Kiểm tra modal edit đóng khi click cancel
        // Setup: Mở modal edit, click "Hủy"
        // Assertions: Modal không còn hiển thị
        it('should close edit modal when cancel button is clicked', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            await screen.findByText('Electronics');

            const editButtons = screen.getAllByLabelText('Sửa');
            fireEvent.click(editButtons[0]);

            const cancelButtons = screen.getAllByText('Hủy');
            fireEvent.click(cancelButtons[cancelButtons.length - 1]);

            expect(screen.queryByText('Chỉnh sửa danh mục')).not.toBeInTheDocument();
        });

        // Test 15: Kiểm tra error hiển thị khi edit thất bại
        // Setup: Mock API trả về error khi edit
        // Assertions: Error message hiển thị trên UI
        it('should display error when edit fails', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockCategories,
                })
                .mockResolvedValueOnce({
                    ok: false,
                    json: async () => ({ message: 'Cập nhật thất bại' }),
                });

            render(<Categories />);

            await screen.findByText('Electronics');

            const editButtons = screen.getAllByLabelText('Sửa');
            fireEvent.click(editButtons[0]);

            const input = screen.getByDisplayValue('Electronics');
            fireEvent.change(input, { target: { value: 'Updated Electronics' } });

            const saveButton = screen.getByRole('button', { name: 'Lưu' });
            fireEvent.click(saveButton);

            await screen.findByText('Cập nhật thất bại');
        });
    });

    /**
     * TOGGLE STATUS TESTS
     * Test chức năng bật/tắt trạng thái category
     */

    // Test 16: Kiểm tra toggle status hoạt động
    // Setup: Click status button của category active
    // Assertions: API PATCH được gọi với is_active: false
    describe('Toggle Status', () => {
        it('should toggle category status when status button is clicked', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockCategories,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ _id: '1', is_active: false }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [
                        { ...mockCategories[0], is_active: false },
                        ...mockCategories.slice(1),
                    ],
                });

            render(<Categories />);

            await screen.findByText('Electronics');

            const statusButtons = screen.getAllByRole('button', { name: /Hoạt động|Dừng hoạt động/i });
            fireEvent.click(statusButtons[0]);

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    'http://localhost:8000/api/categories/1/activate',
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${mockToken}`,
                        },
                        body: JSON.stringify({ is_active: false }),
                    }
                );
            });
        });

        // Test 17: Kiểm tra hiển thị status badge đúng
        // Setup: Render với mock categories (có active và inactive)
        // Assertions: Có cả button "Hoạt động" và "Dừng hoạt động"
        it('should display correct status badge', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            await screen.findByText('Electronics');
            const activeButtons = screen.getAllByRole('button', { name: 'Hoạt động' });
            expect(activeButtons.length).toBeGreaterThan(0);
            const inactiveButtons = screen.getAllByRole('button', { name: 'Dừng hoạt động' });
            expect(inactiveButtons.length).toBeGreaterThan(0);
        })
    });

    /**
     * SEARCH FUNCTIONALITY TESTS
     * Test chức năng tìm kiếm categories
     */

    // Test 18: Kiểm tra filter categories theo search input
    // Setup: Nhập "Electronics" vào search, click tìm kiếm
    // Assertions: Chỉ "Electronics" hiển thị, "Clothing" và "Books" bị ẩn
    describe('Search Functionality', () => {
        it('should filter categories based on search input', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            await screen.findByText('Electronics');

            const searchInput = screen.getByPlaceholderText('Tìm danh mục...');
            fireEvent.change(searchInput, { target: { value: 'Electronics' } });

            const searchButton = screen.getByRole('button', { name: 'Tìm kiếm' });
            fireEvent.click(searchButton);

            expect(screen.getByText('Electronics')).toBeInTheDocument();
            expect(screen.queryByText('Clothing')).not.toBeInTheDocument();
            expect(screen.queryByText('Books')).not.toBeInTheDocument();
        });

        // Test 19: Kiểm tra empty state khi search không có kết quả
        // Setup: Search với từ khóa không tồn tại
        // Assertions: Text "Không có danh mục nào phù hợp." hiển thị
        it('should display empty state when search has no results', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            await screen.findByText('Electronics');

            const searchInput = screen.getByPlaceholderText('Tìm danh mục...');
            fireEvent.change(searchInput, { target: { value: 'NonExistent' } });

            const searchButton = screen.getByRole('button', { name: 'Tìm kiếm' });
            fireEvent.click(searchButton);

            expect(screen.getByText('Không có danh mục nào phù hợp.')).toBeInTheDocument();
        });

        // Test 20: Kiểm tra search case-insensitive
        // Setup: Search với "electronics" (chữ thường)
        // Assertions: "Electronics" vẫn hiển thị
        it('should be case-insensitive when searching', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            await screen.findByText('Electronics');

            const searchInput = screen.getByPlaceholderText('Tìm danh mục...');
            fireEvent.change(searchInput, { target: { value: 'electronics' } });

            const searchButton = screen.getByRole('button', { name: 'Tìm kiếm' });
            fireEvent.click(searchButton);

            expect(screen.getByText('Electronics')).toBeInTheDocument();
        });
    });

    /**
     * TABLE DISPLAY TESTS
     * Test hiển thị bảng categories
     */

    // Test 21: Kiểm tra table headers hiển thị đúng
    // Setup: Render component với categories
    // Assertions: 4 headers: TÊN DANH MỤC, TRẠNG THÁI, NGÀY TẠO, THAO TÁC
    describe('Table Display', () => {
        it('should display correct table headers', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            await screen.findByText('TÊN DANH MỤC');
            expect(screen.getByText('TRẠNG THÁI')).toBeInTheDocument();
            expect(screen.getByText('NGÀY TẠO')).toBeInTheDocument();
            expect(screen.getByText('THAO TÁC')).toBeInTheDocument();
        });

        // Test 22: Kiểm tra format ngày tạo đúng (dd/mm/yyyy)
        // Setup: Mock category với created_at cụ thể
        // Assertions: Ngày hiển thị đúng format Việt Nam
        it('should display category creation date in correct format', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [
                    {
                        _id: '1',
                        name: 'Test Category',
                        is_active: true,
                        created_at: '2025-01-15T00:00:00Z',
                    },
                ],
            });

            render(<Categories />);

            const dateCell = await screen.findByText(/15\/1\/2025/);
            expect(dateCell).toBeInTheDocument();
        });

        // Test 23: Kiểm tra edit button cho mỗi category
        // Setup: Render với 3 mock categories
        // Assertions: Có đúng 3 edit buttons
        it('should display edit button for each category', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            await screen.findByText('Electronics');
            const editButtons = screen.getAllByLabelText('Sửa');
            expect(editButtons.length).toBe(mockCategories.length);
        });
    });

    /**
     * MODALS BEHAVIOR TESTS
     * Test hành vi của các modal (create/edit)
     */

    // Test 24: Kiểm tra modal đóng khi click outside
    // Setup: Mở create modal, click vào overlay
    // Assertions: Modal đóng lại
    describe('Modals Behavior', () => {
        it('should close create modal when clicking outside', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            // Wait for component to load categories first
            await screen.findByText('Electronics');

            const createButton = screen.getByRole('button', { name: /Thêm danh mục/i });
            fireEvent.click(createButton);

            await screen.findByText('Tạo danh mục mới');

            // Find the modal overlay using data-testid and click it
            const modalOverlay = screen.getByTestId('create-modal-overlay');
            fireEvent.click(modalOverlay);

            await waitFor(() => {
                expect(screen.queryByText('Tạo danh mục mới')).not.toBeInTheDocument();
            });
        });

        // Test 25: Kiểm tra modal không đóng khi click vào content
        // Setup: Mở create modal, click vào modal content
        // Assertions: Modal vẫn mở
        it('should not close modal when clicking on modal content', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            // Wait for component to load categories first
            await screen.findByText('Electronics');

            const createButton = screen.getByRole('button', { name: /Thêm danh mục/i });
            fireEvent.click(createButton);

            await screen.findByText('Tạo danh mục mới');

            // Find the modal content using data-testid and click it
            const modalContent = screen.getByTestId('create-modal-content');
            fireEvent.click(modalContent);

            // Modal should still be open
            expect(screen.getByText('Tạo danh mục mới')).toBeInTheDocument();
        })
    });

    /**
     * AUTHORIZATION TESTS
     * Test xác thực và authorization headers
     */

    // Test 26: Kiểm tra gửi authorization header với token
    // Setup: Render component với token trong localStorage
    // Assertions: Tất cả API calls có Authorization header với Bearer token
    describe('Authorization', () => {
        it('should send authorization header with token', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCategories,
            });

            render(<Categories />);

            await screen.findByText('Electronics');

            expect(global.fetch).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${mockToken}`,
                    }),
                })
            );
        });
    });
});
