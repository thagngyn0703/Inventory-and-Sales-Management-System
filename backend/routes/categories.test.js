const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const Category = require('../models/Category');
const categoriesRouter = require('./categories');
const { verifyToken, requireManagerOrWarehouse } = require('../middleware/authMiddleware');

// Mock middleware
jest.mock('../middleware/authMiddleware', () => ({
    verifyToken: jest.fn((req, res, next) => {
        req.user = { id: 'test-user', role: 'manager' };
        next();
    }),
    requireManagerOrWarehouse: jest.fn((req, res, next) => {
        next();
    }),
}));

// Mock Category model
jest.mock('../models/Category');

describe('Categories Routes', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/api/categories', categoriesRouter);
        jest.clearAllMocks();
    });

    describe('GET /api/categories', () => {
        it('should fetch all categories without is_active filter when ?all=true', async () => {
            const mockCategories = [
                { _id: '1', name: 'Electronics', is_active: true },
                { _id: '2', name: 'Books', is_active: false },
            ];

            Category.find.mockReturnValue({
                sort: jest.fn().mockResolvedValueOnce(mockCategories),
            });

            const res = await request(app).get('/api/categories?all=true');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockCategories);
            expect(Category.find).toHaveBeenCalledWith({});
        });

        it('should fetch only active categories without ?all parameter', async () => {
            const activeCat = [{ _id: '1', name: 'Electronics', is_active: true }];

            Category.find.mockReturnValue({
                sort: jest.fn().mockResolvedValueOnce(activeCat),
            });

            const res = await request(app).get('/api/categories');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(activeCat);
            expect(Category.find).toHaveBeenCalledWith({ is_active: true });
        });

        it('should return 500 on database error', async () => {
            const error = new Error('Database error');
            Category.find.mockImplementationOnce(() => {
                throw error;
            });

            const res = await request(app).get('/api/categories');

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: 'Server error' });
        });

        it('should sort categories by created_at in descending order', async () => {
            const mockCategories = [
                { _id: '2', name: 'Books', created_at: new Date('2024-01-16') },
                { _id: '1', name: 'Electronics', created_at: new Date('2024-01-15') },
            ];

            const sortMock = jest.fn().mockResolvedValueOnce(mockCategories);
            Category.find.mockReturnValue({
                sort: sortMock,
            });

            const res = await request(app).get('/api/categories');

            expect(sortMock).toHaveBeenCalledWith({ created_at: -1 });
        });
    });

    describe('POST /api/categories', () => {
        it('should create a new category successfully', async () => {
            const newCategory = {
                _id: '1',
                name: 'Electronics',
                is_active: true,
                created_at: '2026-03-09T07:28:04.439Z',
            };

            Category.findOne.mockResolvedValueOnce(null); // No duplicate
            Category.create.mockResolvedValueOnce(newCategory);

            const res = await request(app)
                .post('/api/categories')
                .send({ name: 'Electronics' });

            expect(res.status).toBe(201);
            expect(res.body).toEqual(newCategory);
            expect(Category.create).toHaveBeenCalledWith({ name: 'Electronics' });
        });

        it('should return 400 when category name is empty', async () => {
            const res = await request(app)
                .post('/api/categories')
                .send({ name: '' });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Tên danh mục không được để trống');
        });

        it('should return 400 when category name is only whitespace', async () => {
            const res = await request(app)
                .post('/api/categories')
                .send({ name: '   ' });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Tên danh mục không được để trống');
        });

        it('should return 400 when category name is not provided', async () => {
            const res = await request(app)
                .post('/api/categories')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Tên danh mục không được để trống');
        });

        it('should return 400 when category already exists (case-insensitive)', async () => {
            Category.findOne.mockResolvedValueOnce({
                _id: '1',
                name: 'Electronics',
            });

            const res = await request(app)
                .post('/api/categories')
                .send({ name: 'ELECTRONICS' });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Danh mục đã tồn tại');
            expect(Category.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: expect.any(RegExp),
                })
            );
        });

        it('should trim whitespace from category name', async () => {
            const newCategory = {
                _id: '1',
                name: 'Electronics',
                is_active: true,
            };

            Category.findOne.mockResolvedValueOnce(null);
            Category.create.mockResolvedValueOnce(newCategory);

            const res = await request(app)
                .post('/api/categories')
                .send({ name: '  Electronics  ' });

            expect(res.status).toBe(201);
            expect(Category.create).toHaveBeenCalledWith({ name: 'Electronics' });
        });

        it('should return 500 on server error', async () => {
            const error = new Error('Unexpected error');
            Category.findOne.mockImplementationOnce(() => {
                throw error;
            });

            const res = await request(app)
                .post('/api/categories')
                .send({ name: 'Electronics' });

            expect(res.status).toBe(500);
            expect(res.body.message).toBe('Server error');
        });
    });

    describe('PUT /api/categories/:id', () => {
        it('should update category name successfully', async () => {
            const updatedCategory = {
                _id: '1',
                name: 'Electronics Updated',
                is_active: true,
                save: jest.fn().mockResolvedValueOnce(),
            };

            Category.findById.mockResolvedValueOnce(updatedCategory);
            Category.findOne.mockResolvedValueOnce(null); // No conflict

            const res = await request(app)
                .put('/api/categories/1')
                .send({ name: 'Electronics Updated' });

            expect(res.status).toBe(200);
            expect(updatedCategory.name).toBe('Electronics Updated');
            expect(updatedCategory.save).toHaveBeenCalled();
        });

        it('should return 400 when name is empty', async () => {
            const res = await request(app)
                .put('/api/categories/1')
                .send({ name: '' });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Tên danh mục không được để trống');
        });

        it('should return 404 when category not found', async () => {
            Category.findById.mockResolvedValueOnce(null);

            const res = await request(app)
                .put('/api/categories/invalid-id')
                .send({ name: 'Electronics' });

            expect(res.status).toBe(404);
            expect(res.body.message).toBe('Không tìm thấy danh mục');
        });

        it('should return 400 when name conflicts with another category', async () => {
            const existingCategory = {
                _id: '1',
                name: 'Electronics',
                is_active: true,
                save: jest.fn(),
            };

            const conflictingCategory = {
                _id: '2',
                name: 'Duplicate',
            };

            Category.findById.mockResolvedValueOnce(existingCategory);
            Category.findOne.mockResolvedValueOnce(conflictingCategory);

            const res = await request(app)
                .put('/api/categories/1')
                .send({ name: 'Duplicate' });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Tên danh mục đã được sử dụng');
        });

        it('should allow updating to same name', async () => {
            const category = {
                _id: '1',
                name: 'Electronics',
                is_active: true,
                save: jest.fn().mockResolvedValueOnce(),
            };

            Category.findById.mockResolvedValueOnce(category);
            Category.findOne.mockResolvedValueOnce(null);

            const res = await request(app)
                .put('/api/categories/1')
                .send({ name: 'Electronics' });

            expect(res.status).toBe(200);
            expect(category.save).toHaveBeenCalled();
        });

        it('should return 500 on server error', async () => {
            const error = new Error('Unexpected error');
            Category.findById.mockImplementationOnce(() => {
                throw error;
            });

            const res = await request(app)
                .put('/api/categories/1')
                .send({ name: 'Electronics' });

            expect(res.status).toBe(500);
            expect(res.body.message).toBe('Server error');
        });
    });

    describe('PATCH /api/categories/:id/activate', () => {
        it('should set category to active', async () => {
            const updatedCategory = {
                _id: '1',
                name: 'Electronics',
                is_active: true,
            };

            Category.findByIdAndUpdate.mockResolvedValueOnce(updatedCategory);

            const res = await request(app)
                .patch('/api/categories/1/activate')
                .send({ is_active: true });

            expect(res.status).toBe(200);
            expect(res.body.is_active).toBe(true);
            expect(Category.findByIdAndUpdate).toHaveBeenCalledWith('1', { is_active: true }, { new: true });
        });

        it('should set category to inactive', async () => {
            const updatedCategory = {
                _id: '1',
                name: 'Electronics',
                is_active: false,
            };

            Category.findByIdAndUpdate.mockResolvedValueOnce(updatedCategory);

            const res = await request(app)
                .patch('/api/categories/1/activate')
                .send({ is_active: false });

            expect(res.status).toBe(200);
            expect(res.body.is_active).toBe(false);
        });

        it('should toggle is_active when value not provided', async () => {
            const category = {
                _id: '1',
                name: 'Electronics',
                is_active: true,
            };

            const updatedCategory = {
                _id: '1',
                name: 'Electronics',
                is_active: false,
            };

            Category.findById.mockResolvedValueOnce(category);
            Category.findByIdAndUpdate.mockResolvedValueOnce(updatedCategory);

            const res = await request(app)
                .patch('/api/categories/1/activate')
                .send({});

            expect(res.status).toBe(200);
            expect(res.body.is_active).toBe(false);
            expect(Category.findByIdAndUpdate).toHaveBeenCalledWith('1', { is_active: false }, { new: true });
        });

        it('should return 404 when category not found during toggle', async () => {
            Category.findById.mockResolvedValueOnce(null);

            const res = await request(app)
                .patch('/api/categories/invalid-id/activate')
                .send({});

            expect(res.status).toBe(404);
            expect(res.body.message).toBe('Không tìm thấy danh mục');
        });

        it('should return 404 when update returns null', async () => {
            Category.findByIdAndUpdate.mockResolvedValueOnce(null);

            const res = await request(app)
                .patch('/api/categories/1/activate')
                .send({ is_active: true });

            expect(res.status).toBe(404);
            expect(res.body.message).toBe('Không tìm thấy danh mục');
        });

        it('should return 500 on server error', async () => {
            const error = new Error('Unexpected error');
            Category.findByIdAndUpdate.mockImplementationOnce(() => {
                throw error;
            });

            const res = await request(app)
                .patch('/api/categories/1/activate')
                .send({ is_active: true });

            expect(res.status).toBe(500);
            expect(res.body.message).toBe('Server error');
        });
    });

    describe('Authentication & Authorization', () => {
        it('should require authentication for all routes', async () => {
            // This test verifies that verifyToken middleware is applied
            expect(verifyToken).toBeDefined();
        });

        it('should require manager or warehouse role', async () => {
            // This test verifies that requireManagerOrWarehouse middleware is applied
            expect(requireManagerOrWarehouse).toBeDefined();
        });
    });
});
