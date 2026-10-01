const { ForbiddenError } = require('../utils/errors');

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return next(new ForbiddenError('Access forbidden: Administrator privileges required to perform this action.'));
    }
    next();
}

module.exports = requireAdmin;
