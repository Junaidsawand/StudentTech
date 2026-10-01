const categoryService = require('../../services/admin/category.service');

class CategoryController {
    async createCategory(req, res, next) {
        try {
            const { name, slug, parent_id, description, is_active } = req.body;
            const category = await categoryService.createCategory({
                name,
                slug,
                parent_id,
                description,
                is_active
            });

            res.status(201).json({
                success: true,
                message: 'Category created successfully.',
                data: category
            });
        } catch (err) {
            next(err);
        }
    }

    async getCategoryTree(req, res, next) {
        try {
            const result = await categoryService.getCategoryTree();
            res.status(200).json({
                success: true,
                total: result.total_count,
                data: result.categories
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new CategoryController();
