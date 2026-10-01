const skuService = require('../../services/admin/sku.service');

class SkuController {
    async createSkuForProduct(req, res, next) {
        try {
            const { id } = req.params;
            const sku = await skuService.createSku(id, req.body);
            res.status(201).json({
                success: true,
                message: 'SKU created successfully.',
                data: sku
            });
        } catch (err) {
            next(err);
        }
    }

    async updateSku(req, res, next) {
        try {
            const { id } = req.params;
            const updated = await skuService.updateSku(id, req.body);
            res.status(200).json({
                success: true,
                message: 'SKU updated successfully.',
                data: updated
            });
        } catch (err) {
            next(err);
        }
    }

    async createVariantForProduct(req, res, next) {
        try {
            const { id } = req.params;
            const variant = await skuService.createVariant(id, req.body);
            res.status(201).json({
                success: true,
                message: 'Product variant definition created successfully.',
                data: variant
            });
        } catch (err) {
            next(err);
        }
    }

    async getVariantsForProduct(req, res, next) {
        try {
            const { id } = req.params;
            const variants = await skuService.getVariantsByProduct(id);
            res.status(200).json({
                success: true,
                total: variants.length,
                data: variants
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new SkuController();
