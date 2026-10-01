class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = []) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message, details = []) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}

class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found.`, 404, 'NOT_FOUND');
    }
}

class ConflictError extends AppError {
    constructor(message, details = []) {
        super(message, 409, 'CONFLICT_ERROR', details);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required. Missing or invalid token.') {
        super(message, 401, 'UNAUTHORIZED');
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Access forbidden: Administrator privileges required.') {
        super(message, 403, 'FORBIDDEN');
    }
}

module.exports = {
    AppError,
    ValidationError,
    NotFoundError,
    ConflictError,
    UnauthorizedError,
    ForbiddenError
};
