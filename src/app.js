const express = require('express');
const categoryRoutes = require('./routes/admin/categories.routes');
const productRoutes = require('./routes/admin/products.routes');
const skuRoutes = require('./routes/admin/skus.routes');
const { AppError } = require('./utils/errors');

const app = express();

// Core parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Liveness & health check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'studenttech-api',
        timestamp: new Date().toISOString()
    });
});

// Admin Catalog Routes
app.use('/api/v1/admin/categories', categoryRoutes);
app.use('/api/v1/admin/products', productRoutes);
app.use('/api/v1/admin/skus', skuRoutes);

// Catch-all 404 for unhandled routes
app.use((req, res, next) => {
    res.status(404).json({
        error: {
            code: 'NOT_FOUND',
            message: `Cannot ${req.method} ${req.originalUrl}`,
            details: null
        }
    });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
    // Check if error is a JSON parse syntax error from express.json()
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            error: {
                code: 'INVALID_JSON',
                message: 'Malformed JSON payload provided in request body.',
                details: null
            }
        });
    }

    // Operational application errors (subclasses of AppError)
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: {
                code: err.code,
                message: err.message,
                details: err.details && err.details.length > 0 ? err.details : null
            }
        });
    }

    // PostgreSQL specific error mapping
    if (err.code) {
        // Unique violation (e.g. unique slug, sku_code)
        if (err.code === '23505') {
            return res.status(409).json({
                error: {
                    code: 'CONFLICT_ERROR',
                    message: err.detail || 'Unique constraint violation: resource with this identifier already exists.',
                    details: null
                }
            });
        }
        // Foreign key violation
        if (err.code === '23503') {
            return res.status(400).json({
                error: {
                    code: 'FOREIGN_KEY_VIOLATION',
                    message: err.detail || 'Referenced parent entity does not exist.',
                    details: null
                }
            });
        }
        // Check constraint violation
        if (err.code === '23514') {
            return res.status(400).json({
                error: {
                    code: 'CHECK_CONSTRAINT_VIOLATION',
                    message: err.detail || 'Database constraint validation failed.',
                    details: null
                }
            });
        }
        // Invalid text representation / data type
        if (err.code === '22P02') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_DATA_TYPE',
                    message: 'Invalid input syntax for type.',
                    details: null
                }
            });
        }
    }

    // Unhandled / server errors
    console.error('Unhandled Error:', err);
    return res.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected internal error occurred.',
            details: null
        }
    });
});

module.exports = app;
