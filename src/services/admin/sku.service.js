const db = require('../../database/connection');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');

class SkuService {
    /**
     * Create a variant definition (e.g. Color: ["Matte Black", "Silver"]) for a product.
     */
    async createVariant(productId, { name, option_values }) {
        const parsedProductId = parseInt(productId, 10);
        if (isNaN(parsedProductId)) {
            throw new ValidationError('Invalid product ID format.');
        }

        const productCheck = await db.query('SELECT id, status FROM products WHERE id = $1', [parsedProductId]);
        if (productCheck.rows.length === 0) {
            throw new NotFoundError(`Product with ID ${parsedProductId}`);
        }

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            throw new ValidationError('Variant name is required (e.g., Color, Size).');
        }

        if (!Array.isArray(option_values) || option_values.length === 0) {
            throw new ValidationError('option_values must be a non-empty array of strings.');
        }

        const cleanName = name.trim();
        const cleanValues = option_values.map(val => String(val).trim()).filter(Boolean);

        if (cleanValues.length === 0) {
            throw new ValidationError('option_values must contain at least one valid string value.');
        }

        const existingVariant = await db.query(
            'SELECT id FROM variants WHERE product_id = $1 AND LOWER(name) = LOWER($2)',
            [parsedProductId, cleanName]
        );

        if (existingVariant.rows.length > 0) {
            throw new ConflictError(`Variant '${cleanName}' already exists for this product.`);
        }

        const { rows } = await db.query(
            `INSERT INTO variants (product_id, name, option_values)
             VALUES ($1, $2, $3)
             RETURNING id, product_id, name, option_values, created_at, updated_at`,
            [parsedProductId, cleanName, JSON.stringify(cleanValues)]
        );

        return rows[0];
    }

    /**
     * Retrieve all variant definitions for a product.
     */
    async getVariantsByProduct(productId) {
        const parsedProductId = parseInt(productId, 10);
        if (isNaN(parsedProductId)) {
            throw new ValidationError('Invalid product ID format.');
        }

        const { rows } = await db.query(
            'SELECT id, product_id, name, option_values, created_at, updated_at FROM variants WHERE product_id = $1 ORDER BY id ASC',
            [parsedProductId]
        );

        return rows;
    }

    /**
     * Create a sellable SKU for an existing product.
     */
    async createSku(productId, {
        sku_code,
        price,
        stock_quantity = 0,
        is_active = true,
        variant_options = {},
        variant_id = null
    }) {
        const parsedProductId = parseInt(productId, 10);
        if (isNaN(parsedProductId)) {
            throw new ValidationError('Invalid product ID format.');
        }

        // Verify product existence and status
        const productCheck = await db.query('SELECT id, status FROM products WHERE id = $1', [parsedProductId]);
        if (productCheck.rows.length === 0) {
            throw new NotFoundError(`Product with ID ${parsedProductId}`);
        }

        const product = productCheck.rows[0];
        if (product.status === 'archived') {
            throw new ValidationError('Cannot add SKUs to an archived product.');
        }

        // Validate SKU code
        if (!sku_code || typeof sku_code !== 'string' || sku_code.trim().length === 0) {
            throw new ValidationError('sku_code is required and must be a non-empty string.');
        }

        const cleanSkuCode = sku_code.trim().toUpperCase();
        if (!/^[A-Z0-9_\-]+$/.test(cleanSkuCode)) {
            throw new ValidationError('sku_code must contain only uppercase alphanumeric characters, underscores, and hyphens.');
        }

        // Uniqueness check for SKU code
        const skuCheck = await db.query('SELECT id FROM skus WHERE sku_code = $1', [cleanSkuCode]);
        if (skuCheck.rows.length > 0) {
            throw new ConflictError(`SKU with code '${cleanSkuCode}' already exists.`);
        }

        // Validate price (must be positive/non-negative decimal)
        if (price === undefined || price === null || isNaN(parseFloat(price))) {
            throw new ValidationError('A valid numeric price is required.');
        }
        const numericPrice = parseFloat(price);
        if (numericPrice < 0) {
            throw new ValidationError('Price must be a non-negative decimal value.');
        }

        // Validate stock quantity
        const parsedStock = parseInt(stock_quantity, 10);
        if (isNaN(parsedStock) || parsedStock < 0) {
            throw new ValidationError('stock_quantity must be a non-negative integer.');
        }

        // Validate variant options structure
        if (typeof variant_options !== 'object' || Array.isArray(variant_options) || variant_options === null) {
            throw new ValidationError('variant_options must be a valid JSON object of key-value pairs.');
        }

        // Validate variant_id if supplied
        let parsedVariantId = null;
        if (variant_id !== null && variant_id !== undefined && variant_id !== '') {
            parsedVariantId = parseInt(variant_id, 10);
            if (isNaN(parsedVariantId)) {
                throw new ValidationError('variant_id must be a valid integer ID.');
            }
            const vCheck = await db.query('SELECT id FROM variants WHERE id = $1 AND product_id = $2', [parsedVariantId, parsedProductId]);
            if (vCheck.rows.length === 0) {
                throw new ValidationError(`Variant with ID ${parsedVariantId} does not belong to product ${parsedProductId}.`);
            }
        }

        // Validate against defined product variants (CAT-04: valid combinations only)
        const definedVariants = await this.getVariantsByProduct(parsedProductId);
        if (definedVariants.length > 0 && Object.keys(variant_options).length > 0) {
            for (const [optKey, optVal] of Object.entries(variant_options)) {
                const matchedVariant = definedVariants.find(v => v.name.toLowerCase() === optKey.toLowerCase());
                if (!matchedVariant) {
                    throw new ValidationError(`Product does not define a variant option for '${optKey}'.`);
                }
                const allowedValues = matchedVariant.option_values || [];
                const valueExists = allowedValues.some(v => String(v).toLowerCase() === String(optVal).toLowerCase());
                if (!valueExists) {
                    throw new ValidationError(
                        `Invalid variant option value '${optVal}' for '${optKey}'. Allowed: ${allowedValues.join(', ')}.`
                    );
                }
            }
        }

        // Check for duplicate variant combination on the same product
        const dupCombCheck = await db.query(
            'SELECT id FROM skus WHERE product_id = $1 AND variant_options = $2',
            [parsedProductId, JSON.stringify(variant_options)]
        );
        if (dupCombCheck.rows.length > 0) {
            throw new ConflictError('An SKU with this exact variant combination already exists for this product.');
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const { rows } = await client.query(
                `INSERT INTO skus (
                    product_id, variant_id, sku_code, variant_options, price, stock_quantity, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id, product_id, variant_id, sku_code, variant_options, price, stock_quantity, is_active, created_at, updated_at`,
                [
                    parsedProductId,
                    parsedVariantId,
                    cleanSkuCode,
                    JSON.stringify(variant_options),
                    numericPrice.toFixed(2),
                    parsedStock,
                    Boolean(is_active)
                ]
            );

            await client.query('COMMIT');
            return rows[0];
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Update price, stock_quantity, or active status of a SKU.
     */
    async updateSku(id, updates) {
        const parsedId = parseInt(id, 10);
        if (isNaN(parsedId)) {
            throw new ValidationError('Invalid SKU ID format.');
        }

        // Check existing SKU
        const existing = await db.query(
            'SELECT id, product_id, sku_code, price, stock_quantity, is_active FROM skus WHERE id = $1',
            [parsedId]
        );

        if (existing.rows.length === 0) {
            throw new NotFoundError(`SKU with ID ${parsedId}`);
        }

        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (updates.price !== undefined) {
            const numPrice = parseFloat(updates.price);
            if (isNaN(numPrice) || numPrice < 0) {
                throw new ValidationError('Price must be a non-negative decimal number.');
            }
            fields.push(`price = $${paramIndex++}`);
            values.push(numPrice.toFixed(2));
        }

        if (updates.stock_quantity !== undefined) {
            const numStock = parseInt(updates.stock_quantity, 10);
            if (isNaN(numStock) || numStock < 0) {
                throw new ValidationError('stock_quantity must be a non-negative integer.');
            }
            fields.push(`stock_quantity = $${paramIndex++}`);
            values.push(numStock);
        }

        if (updates.is_active !== undefined) {
            fields.push(`is_active = $${paramIndex++}`);
            values.push(Boolean(updates.is_active));
        }

        if (fields.length === 0) {
            throw new ValidationError('No valid update fields (price, stock_quantity, is_active) were provided.');
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(parsedId);

        const queryText = `
            UPDATE skus
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, product_id, variant_id, sku_code, variant_options, price, stock_quantity, is_active, created_at, updated_at
        `;

        const { rows } = await db.query(queryText, values);
        return rows[0];
    }
}

module.exports = new SkuService();
