const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../utils/errors');

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new UnauthorizedError('Authentication token is missing. Please provide a Bearer token.'));
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'studenttech-dev-secret-key-2026';

    try {
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return next(new UnauthorizedError('Authentication token has expired. Please log in again.'));
        }
        return next(new UnauthorizedError('Invalid authentication token.'));
    }
}

module.exports = authenticate;
