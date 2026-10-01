const db = require('../../database/connection');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');

class ProductService {
    /**
     * Create a product (default 'draft').
     */
    async createProduct({
        name,
        slug,
        description = null,
        category_id,
        status = 'draft',
        specifications = {},
        price = 0.00,
        stock_quantity = 0,
        is_active = true
    }) {
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            throw new ValidationError('Product name is required and must be a non-empty string.');
        }

        if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
            throw new ValidationError('Product slug is required and must be a non-empty string.');
        }

        const cleanSlug = slug.trim().toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
            throw new ValidationError('Slug must contain only lowercase letters, numbers, and hyphens.');
        }

        if (!category_id || isNaN(parseInt(category_id, 10))) {
            throw new ValidationError('A valid category_id is required.');
        }

        const parsedCategoryId = parseInt(category_id, 10);
        const catCheck = await db.query('SELECT id, is_active FROM categories WHERE id = $1', [parsedCategoryId]);
        if (catCheck.rows.length === 0) {
            throw new NotFoundError(`Category with ID ${parsedCategoryId}`);
        }

        // Slug uniqueness check
        const slugCheck = await db.query('SELECT id FROM products WHERE slug = $1', [cleanSlug]);
        if (slugCheck.rows.length > 0) {
            throw new ConflictError(`Product with slug '${cleanSlug}' already exists.`);
        }

        // Validate status
        const allowedStatuses = ['draft', 'published', 'archived'];
        const cleanStatus = (status || 'draft').toLowerCase();
        if (!allowedStatuses.includes(cleanStatus)) {
            throw new ValidationError(`Invalid product status '${status}'. Allowed: ${allowedStatuses.join(', ')}.`);
        }

        // Business Rule: A newly created product cannot be immediately published without SKUs
        if (cleanStatus === 'published') {
            throw new ValidationError(
                "Cannot create product with 'published' status immediately. Create as 'draft' first, add at least one sellable SKU, and then publish."
            );
        }

        // Validate specifications is an object
        if (typeof specifications !== 'object' || Array.isArray(specifications) || specifications === null) {
            throw new ValidationError('Product specifications must be a valid JSON object.');
        }

        const { rows } = await db.query(
            `INSERT INTO products (
                category_id, name, slug, description, price, stock_quantity, status, specifications, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, category_id, name, slug, description, price, stock_quantity, status, specifications, is_active, created_at, updated_at`,
            [
                parsedCategoryId,
                name.trim(),
                cleanSlug,
                description ? description.trim() : null,
                parseFloat(price) || 0.00,
                parseInt(stock_quantity, 10) || 0,
                cleanStatus,
                JSON.stringify(specifications),
                Boolean(is_active)
            ]
        );

        return rows[0];
    }

    /**
     * Update an existing product.
     */
    async updateProduct(id, updates) {
        const parsedId = parseInt(id, 10);
        if (isNaN(parsedId)) {
            throw new ValidationError('Invalid product ID format.');
        }

        // Find existing product
        const existing = await db.query(
            'SELECT id, name, slug, category_id, status, specifications, is_active FROM products WHERE id = $1',
            [parsedId]
        );

        if (existing.rows.length === 0) {
            throw new NotFoundError(`Product with ID ${parsedId}`);
        }

        const currentProduct = existing.rows[0];
        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (updates.name !== undefined) {
            if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
                throw new ValidationError('Product name must be a non-empty string.');
            }
            fields.push(`name = $${paramIndex++}`);
            values.push(updates.name.trim());
        }

        if (updates.slug !== undefined) {
            const cleanSlug = updates.slug.trim().toLowerCase();
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
                throw new ValidationError('Slug must contain only lowercase letters, numbers, and hyphens.');
            }

            const slugCheck = await db.query(
                'SELECT id FROM products WHERE slug = $1 AND id <> $2',
                [cleanSlug, parsedId]
            );
            if (slugCheck.rows.length > 0) {
                throw new ConflictError(`Product with slug '${cleanSlug}' already exists.`);
            }

            fields.push(`slug = $${paramIndex++}`);
            values.push(cleanSlug);
        }

        if (updates.description !== undefined) {
            fields.push(`description = $${paramIndex++}`);
            values.push(updates.description ? updates.description.trim() : null);
        }

        if (updates.category_id !== undefined) {
            const catId = parseInt(updates.category_id, 10);
            if (isNaN(catId)) {
                throw new ValidationError('category_id must be a valid integer.');
            }
            const catCheck = await db.query('SELECT id FROM categories WHERE id = $1', [catId]);
            if (catCheck.rows.length === 0) {
                throw new NotFoundError(`Category with ID ${catId}`);
            }
            fields.push(`category_id = $${paramIndex++}`);
            values.push(catId);
        }

        if (updates.specifications !== undefined) {
            if (typeof updates.specifications !== 'object' || Array.isArray(updates.specifications) || updates.specifications === null) {
                throw new ValidationError('specifications must be a valid JSON object.');
            }
            fields.push(`specifications = $${paramIndex++}`);
            values.push(JSON.stringify(updates.specifications));
        }

        if (updates.is_active !== undefined) {
            fields.push(`is_active = $${paramIndex++}`);
            values.push(Boolean(updates.is_active));
        }

        if (updates.status !== undefined) {
            const cleanStatus = updates.status.toLowerCase();
            const allowedStatuses = ['draft', 'published', 'archived'];
            if (!allowedStatuses.includes(cleanStatus)) {
                throw new ValidationError(`Invalid status '${updates.status}'. Allowed: ${allowedStatuses.join(', ')}.`);
            }

            // Business Rule: If transitioning to 'published', verify product has active sellable SKUs
            if (cleanStatus === 'published') {
                const skuCheck = await db.query(
                    'SELECT COUNT(*) AS active_skus FROM skus WHERE product_id = $1 AND is_active = TRUE',
                    [parsedId]
                );
                const activeSkuCount = parseInt(skuCheck.rows[0].active_skus, 10);
                if (activeSkuCount === 0) {
                    throw new ValidationError(
                        'Cannot publish product without at least one active sellable SKU. Please add an active SKU before publishing.'
                    );
                }
            }

            fields.push(`status = $${paramIndex++}`);
            values.push(cleanStatus);
        }

        if (fields.length === 0) {
            throw new ValidationError('No valid update fields were provided in the request body.');
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(parsedId);

        const queryText = `
            UPDATE products
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, category_id, name, slug, description, price, stock_quantity, status, specifications, is_active, created_at, updated_at
        `;

        const { rows } = await db.query(queryText, values);
        return rows[0];
    }

    /**
     * Retrieve all administrative product records with category metadata and SKU summaries.
     */
    async getAdminProducts() {
        const { rows } = await db.query(`
            SELECT 
                p.id,
                p.name,
                p.slug,
                p.description,
                p.status,
                p.specifications,
                p.is_active,
                p.created_at,
                p.updated_at,
                c.id AS category_id,
                c.name AS category_name,
                c.slug AS category_slug,
                COALESCE(s.total_skus, 0)::INTEGER AS total_skus,
                COALESCE(s.min_price, 0.00) AS min_price,
                COALESCE(s.max_price, 0.00) AS max_price,
                COALESCE(s.total_stock, 0)::INTEGER AS total_stock
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN (
                SELECT 
                    product_id,
                    COUNT(id) AS total_skus,
                    MIN(price) AS min_price,
                    MAX(price) AS max_price,
                    SUM(stock_quantity) AS total_stock
                FROM skus
                GROUP BY product_id
            ) s ON p.id = s.product_id
            ORDER BY p.created_at DESC
        `);

        return {
            total_count: rows.length,
            products: rows
        };
    }
}

module.exports = new ProductService();
