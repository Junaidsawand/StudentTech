const express = require('express');
const router = express.Router();
const skuController = require('../../controllers/admin/sku.controller');
const authenticate = require('../../middleware/authenticate');
const requireAdmin = require('../../middleware/requireAdmin');

// All admin SKU routes require authentication and admin role
router.use(authenticate, requireAdmin);

router.patch('/:id', (req, res, next) => skuController.updateSku(req, res, next));

module.exports = router;
