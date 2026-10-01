const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/category.controller');
const authenticate = require('../../middleware/authenticate');
const requireAdmin = require('../../middleware/requireAdmin');

// All admin category routes require authentication and admin role
router.use(authenticate, requireAdmin);

router.post('/', (req, res, next) => categoryController.createCategory(req, res, next));
router.get('/', (req, res, next) => categoryController.getCategoryTree(req, res, next));

module.exports = router;
