const express = require('express');
const router = express.Router();
const productController = require('../../controllers/admin/product.controller');
const skuController = require('../../controllers/admin/sku.controller');
const authenticate = require('../../middleware/authenticate');
const requireAdmin = require('../../middleware/requireAdmin');

// All admin product routes require authentication and admin role
router.use(authenticate, requireAdmin);

router.post('/', (req, res, next) => productController.createProduct(req, res, next));
router.get('/', (req, res, next) => productController.getAdminProducts(req, res, next));
router.patch('/:id', (req, res, next) => productController.updateProduct(req, res, next));

// Sub-routes for SKUs on a specific product
router.post('/:id/skus', (req, res, next) => skuController.createSkuForProduct(req, res, next));

// Sub-routes for Variants on a specific product
router.post('/:id/variants', (req, res, next) => skuController.createVariantForProduct(req, res, next));
router.get('/:id/variants', (req, res, next) => skuController.getVariantsForProduct(req, res, next));

module.exports = router;
