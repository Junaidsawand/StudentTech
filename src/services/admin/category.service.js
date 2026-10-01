const db = require('../../database/connection');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');

class CategoryService {
    /**
     * Checks if setting parent_id creates a circular dependency in the category tree.
     */
    async validateNoCycle(categoryId, targetParentId) {
        if (!targetParentId) return;

        if (categoryId && parseInt(categoryId, 10) === parseInt(targetParentId, 10)) {
            throw new ValidationError('A category cannot be its own parent.');
        }

        let currentId = targetParentId;
        const visited = new Set();
        if (categoryId) visited.add(parseInt(categoryId, 10));

        while (currentId) {
            const { rows } = await db.query(
                'SELECT id, parent_id FROM categories WHERE id = $1',
                [currentId]
            );

            if (rows.length === 0) {
                throw new NotFoundError(`Parent category with ID ${currentId}`);
            }

            const parent = rows[0];
            const pId = parseInt(parent.id, 10);

            if (visited.has(pId)) {
                throw new ValidationError(
                    'Category hierarchy cycle detected: A category cannot become its own ancestor.'
                );
            }

            visited.add(pId);
            currentId = parent.parent_id;
        }
    }

    /**
     * Create a new category with hierarchy and slug uniqueness validation.
     */
    async createCategory({ name, slug, parent_id = null, description = null, is_active = true }) {
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            throw new ValidationError('Category name is required and must be a non-empty string.');
        }

        if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
            throw new ValidationError('Category slug is required and must be a non-empty string.');
        }

        const cleanSlug = slug.trim().toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
            throw new ValidationError('Slug must contain only lowercase letters, numbers, and hyphens.');
        }

        // Check for existing slug
        const existing = await db.query('SELECT id FROM categories WHERE slug = $1', [cleanSlug]);
        if (existing.rows.length > 0) {
            throw new ConflictError(`Category with slug '${cleanSlug}' already exists.`);
        }

        // If parent_id is provided, validate existence and cycle prevention
        let parsedParentId = null;
        if (parent_id !== null && parent_id !== undefined && parent_id !== '') {
            parsedParentId = parseInt(parent_id, 10);
            if (isNaN(parsedParentId)) {
                throw new ValidationError('parent_id must be a valid integer ID.');
            }

            await this.validateNoCycle(null, parsedParentId);
        }

        const { rows } = await db.query(
            `INSERT INTO categories (name, slug, parent_id, description, is_active)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, slug, parent_id, description, is_active, created_at, updated_at`,
            [name.trim(), cleanSlug, parsedParentId, description ? description.trim() : null, Boolean(is_active)]
        );

        return rows[0];
    }

    /**
     * Retrieve all categories and build a structured hierarchical tree.
     */
    async getCategoryTree() {
        const { rows } = await db.query(
            `SELECT id, name, slug, parent_id, description, is_active, created_at, updated_at
             FROM categories
             ORDER BY parent_id NULLS FIRST, name ASC`
        );

        const categoryMap = new Map();
        const rootCategories = [];

        // First pass: initialize each category with an empty children array
        for (const cat of rows) {
            categoryMap.set(cat.id, {
                ...cat,
                children: []
            });
        }

        // Second pass: nest children into their respective parent
        for (const cat of rows) {
            const mappedCat = categoryMap.get(cat.id);
            if (cat.parent_id && categoryMap.has(cat.parent_id)) {
                categoryMap.get(cat.parent_id).children.push(mappedCat);
            } else {
                rootCategories.push(mappedCat);
            }
        }

        return {
            total_count: rows.length,
            categories: rootCategories
        };
    }
}

module.exports = new CategoryService();
