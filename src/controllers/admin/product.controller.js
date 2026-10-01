const productService = require('../../services/admin/product.service');

class ProductController {
    async createProduct(req, res, next) {
        try {
            const product = await productService.createProduct(req.body);
            res.status(201).json({
                success: true,
                message: 'Product draft created successfully.',
                data: product
            });
        } catch (err) {
            next(err);
        }
    }

    async updateProduct(req, res, next) {
        try {
            const { id } = req.params;
            const updated = await productService.updateProduct(id, req.body);
            res.status(200).json({
                success: true,
                message: 'Product updated successfully.',
                data: updated
            });
        } catch (err) {
            next(err);
        }
    }

    async getAdminProducts(req, res, next) {
        try {
            const result = await productService.getAdminProducts();
            res.status(200).json({
                success: true,
                total: result.total_count,
                data: result.products
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ProductController();
