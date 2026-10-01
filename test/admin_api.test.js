const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { newDb } = require('pg-mem');

// Setup in-memory PostgreSQL database for hermetic testing
const memDb = newDb({ autoCreateForeignKeyIndices: true });

// Register necessary PostgreSQL functions
memDb.public.registerFunction({
    name: 'replace',
    args: [memDb.public.getType('text'), memDb.public.getType('text'), memDb.public.getType('text')],
    returns: memDb.public.getType('text'),
    implementation: (str, from, to) => (str ? str.split(from).join(to) : str)
});

memDb.public.registerFunction({
    name: 'regexp_replace',
    args: [memDb.public.getType('text'), memDb.public.getType('text'), memDb.public.getType('text'), memDb.public.getType('text')],
    returns: memDb.public.getType('text'),
    implementation: (str, pattern, replacement, flags) => {
        if (!str) return str;
        const re = new RegExp(pattern, flags || 'g');
        return str.replace(re, replacement);
    }
});

memDb.public.registerFunction({
    name: 'jsonb_typeof',
    args: [memDb.public.getType('jsonb') || memDb.public.getType('text')],
    returns: memDb.public.getType('text'),
    implementation: (val) => {
        if (val === null || val === undefined) return 'null';
        if (Array.isArray(val)) return 'array';
        if (typeof val === 'object') return 'object';
        return 'string';
    }
});

// Load and execute schema migrations
const m1 = fs.readFileSync(path.join(__dirname, '../src/database/migrations/001_sprint1_initial_schema.sql'), 'utf-8')
    .replace(/DO \$\$[\s\S]*?\$\$ LANGUAGE plpgsql;/g, '')
    .replace(/DO \$\$[\s\S]*?\$\$;/g, '')
    .replace(/DECIMAL\(10,\s*2\)/gi, 'NUMERIC')
    .replace(/GENERATED ALWAYS AS IDENTITY/gi, '')
    .replace(/id INTEGER PRIMARY KEY/gi, 'id SERIAL PRIMARY KEY');

const m2 = fs.readFileSync(path.join(__dirname, '../src/database/migrations/002_sprint2_catalog_foundation.sql'), 'utf-8')
    .replace(/DO \$\$[\s\S]*?\$\$ LANGUAGE plpgsql;/g, '')
    .replace(/DO \$\$[\s\S]*?\$\$;/g, '')
    .replace(/DECIMAL\(10,\s*2\)/gi, 'NUMERIC')
    .replace(/GENERATED ALWAYS AS IDENTITY/gi, '')
    .replace(/id INTEGER PRIMARY KEY/gi, 'id SERIAL PRIMARY KEY');

memDb.public.none(m1);
memDb.public.none(m2);

// Mock DB connection pool with pg-mem
const pgAdapter = memDb.adapters.createPg();
const memPool = new pgAdapter.Pool();
const db = require('../src/database/connection');
db.pool = memPool;
db.query = (text, params) => memPool.query(text, params);
db.getClient = () => memPool.connect();

const app = require('../src/app');

// JWT Tokens
const JWT_SECRET = process.env.JWT_SECRET || 'studenttech-dev-secret-key-2026';
const adminToken = jwt.sign(
    { userId: 1, email: 'admin@studenttech.pk', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
);
const customerToken = jwt.sign(
    { userId: 2, email: 'student@usindh.edu.pk', role: 'customer' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

async function runTests() {
    console.log('=====================================================');
    console.log('--- StudentTech Sprint 2 Admin API Verification ---');
    console.log('=====================================================\n');

    let passed = 0;
    let failed = 0;

    async function test(title, fn) {
        try {
            await fn();
            console.log(`  ✔ PASS: ${title}`);
            passed++;
        } catch (err) {
            console.error(`  ✖ FAIL: ${title}`);
            console.error(`    Details: ${err.message}`);
            failed++;
        }
    }

    let rootCategoryId, childCategoryId, subChildCategoryId;
    let productId;
    let variantId;
    let skuId;

    // 1. Health check
    await test('Health check endpoint GET /health returns 200 OK', async () => {
        const res = await request(app).get('/health');
        if (res.status !== 200 || res.body.status !== 'ok') {
            throw new Error(`Expected status 200 ok, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    // 2. Authentication & Authorization gates
    await test('Reject unauthenticated request to admin endpoint with 401 UNAUTHORIZED', async () => {
        const res = await request(app).get('/api/v1/admin/categories');
        if (res.status !== 401 || res.body.error?.code !== 'UNAUTHORIZED') {
            throw new Error(`Expected 401 UNAUTHORIZED, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject invalid/malformed JWT token with 401 UNAUTHORIZED', async () => {
        const res = await request(app)
            .get('/api/v1/admin/categories')
            .set('Authorization', 'Bearer invalid.token.structure');
        if (res.status !== 401 || res.body.error?.code !== 'UNAUTHORIZED') {
            throw new Error(`Expected 401 UNAUTHORIZED, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject customer role user from admin endpoint with 403 FORBIDDEN', async () => {
        const res = await request(app)
            .get('/api/v1/admin/categories')
            .set('Authorization', `Bearer ${customerToken}`);
        if (res.status !== 403 || res.body.error?.code !== 'FORBIDDEN') {
            throw new Error(`Expected 403 FORBIDDEN, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    // 3. Category Management
    await test('Admin can create root category (Technology & Computing)', async () => {
        const res = await request(app)
            .post('/api/v1/admin/categories')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Technology & Computing',
                slug: 'technology-computing',
                description: 'Laptops, peripherals, and study tech essentials',
                parent_id: null
            });
        if (res.status !== 201 || !res.body.data?.id) {
            throw new Error(`Expected 201 Created, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
        rootCategoryId = res.body.data.id;
    });

    await test('Admin can create nested child category (Peripherals)', async () => {
        const res = await request(app)
            .post('/api/v1/admin/categories')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Peripherals',
                slug: 'peripherals',
                description: 'Keyboards, mice, and input devices',
                parent_id: rootCategoryId
            });
        if (res.status !== 201 || res.body.data?.parent_id !== rootCategoryId) {
            throw new Error(`Expected 201 Created with parent_id, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
        childCategoryId = res.body.data.id;
    });

    await test('Admin can create 3rd level subcategory (Mechanical Keyboards)', async () => {
        const res = await request(app)
            .post('/api/v1/admin/categories')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Mechanical Keyboards',
                slug: 'mechanical-keyboards',
                description: 'Compact and ergonomic mechanical keyboards',
                parent_id: childCategoryId
            });
        if (res.status !== 201 || res.body.data?.parent_id !== childCategoryId) {
            throw new Error(`Expected 201 Created, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
        subChildCategoryId = res.body.data.id;
    });

    await test('Reject duplicate category slug with 409 CONFLICT_ERROR', async () => {
        const res = await request(app)
            .post('/api/v1/admin/categories')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Duplicate Tech',
                slug: 'technology-computing',
                description: 'Duplicate slug test'
            });
        if (res.status !== 409 || res.body.error?.code !== 'CONFLICT_ERROR') {
            throw new Error(`Expected 409 CONFLICT_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject category creation referencing non-existent parent_id with 404 NOT_FOUND', async () => {
        const res = await request(app)
            .post('/api/v1/admin/categories')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Orphan Category',
                slug: 'orphan-category',
                parent_id: 99999
            });
        if (res.status !== 404 || res.body.error?.code !== 'NOT_FOUND') {
            throw new Error(`Expected 404 NOT_FOUND, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Admin can retrieve full hierarchical category tree with children nesting', async () => {
        const res = await request(app)
            .get('/api/v1/admin/categories')
            .set('Authorization', `Bearer ${adminToken}`);
        if (res.status !== 200 || !Array.isArray(res.body.data)) {
            throw new Error(`Expected 200 OK with array, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
        const root = res.body.data.find(c => c.id === rootCategoryId);
        if (!root || !root.children || root.children.length === 0) {
            throw new Error('Root category does not contain nested children array.');
        }
        const child = root.children.find(c => c.id === childCategoryId);
        if (!child || !child.children || child.children.length === 0) {
            throw new Error('Child category does not contain grandchild nested children array.');
        }
    });

    // 4. Product Management
    await test('Admin can create product in default DRAFT status', async () => {
        const res = await request(app)
            .post('/api/v1/admin/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                category_id: subChildCategoryId,
                name: 'StudentPro Ergonomic Mechanical Keyboard',
                slug: 'studentpro-ergo-mech-keyboard',
                description: 'Compact 75% mechanical keyboard designed for student study setups.',
                price: 4999.00,
                stock_quantity: 0,
                specifications: {
                    connectivity: 'Bluetooth 5.3 + Type-C USB',
                    layout: '75% Compact 84-Key',
                    backlight: 'White LED Multi-Mode'
                }
            });
        if (res.status !== 201 || res.body.data?.status !== 'draft') {
            throw new Error(`Expected 201 with status 'draft', got ${res.status}: ${JSON.stringify(res.body)}`);
        }
        productId = res.body.data.id;
    });

    await test('Reject duplicate product slug with 409 CONFLICT_ERROR', async () => {
        const res = await request(app)
            .post('/api/v1/admin/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                category_id: subChildCategoryId,
                name: 'Duplicate Keyboard Slug',
                slug: 'studentpro-ergo-mech-keyboard',
                price: 3000.00
            });
        if (res.status !== 409 || res.body.error?.code !== 'CONFLICT_ERROR') {
            throw new Error(`Expected 409 CONFLICT_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject publishing a product without active sellable SKUs', async () => {
        const res = await request(app)
            .patch(`/api/v1/admin/products/${productId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                status: 'published'
            });
        if (res.status !== 400 || res.body.error?.code !== 'VALIDATION_ERROR') {
            throw new Error(`Expected 400 VALIDATION_ERROR for publish without SKUs, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    // 5. Variant Management
    await test('Admin can create variant definition (Switch Type)', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/products/${productId}/variants`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Switch Type',
                option_values: ['Tactile Brown', 'Silent Red', 'Clicky Blue']
            });
        if (res.status !== 201 || !res.body.data?.id) {
            throw new Error(`Expected 201 Created variant, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
        variantId = res.body.data.id;
    });

    await test('Admin can create second variant definition (Chassis Color)', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/products/${productId}/variants`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Color',
                option_values: ['Matte Black', 'Arctic White']
            });
        if (res.status !== 201 || !res.body.data?.id) {
            throw new Error(`Expected 201 Created variant, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject duplicate variant definition on same product with 409 CONFLICT_ERROR', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/products/${productId}/variants`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Switch Type',
                option_values: ['Tactile Brown']
            });
        if (res.status !== 409 || res.body.error?.code !== 'CONFLICT_ERROR') {
            throw new Error(`Expected 409 CONFLICT_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Admin can list all variants defined for a product', async () => {
        const res = await request(app)
            .get(`/api/v1/admin/products/${productId}/variants`)
            .set('Authorization', `Bearer ${adminToken}`);
        if (res.status !== 200 || res.body.total !== 2) {
            throw new Error(`Expected 2 variants, got ${res.body.total}: ${JSON.stringify(res.body)}`);
        }
    });

    // 6. SKU Management & Validation
    await test('Admin can create valid SKU with variant options', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/products/${productId}/skus`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                variant_id: variantId,
                sku_code: 'ST-KB-BRN-BLK',
                price: 4999.00,
                stock_quantity: 25,
                is_active: true,
                variant_options: {
                    'Switch Type': 'Tactile Brown',
                    'Color': 'Matte Black'
                }
            });
        if (res.status !== 201 || !res.body.data?.id) {
            throw new Error(`Expected 201 Created SKU, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
        skuId = res.body.data.id;
    });

    await test('Admin can create second SKU with different variant options', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/products/${productId}/skus`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                variant_id: variantId,
                sku_code: 'ST-KB-RED-WHT',
                price: 5299.00,
                stock_quantity: 15,
                is_active: true,
                variant_options: {
                    'Switch Type': 'Silent Red',
                    'Color': 'Arctic White'
                }
            });
        if (res.status !== 201 || !res.body.data?.id) {
            throw new Error(`Expected 201 Created SKU, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject SKU creation with negative price', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/products/${productId}/skus`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                sku_code: 'ST-KB-FAIL-PRICE',
                price: -100.00,
                stock_quantity: 10,
                variant_options: {
                    'Switch Type': 'Tactile Brown',
                    'Color': 'Arctic White'
                }
            });
        if (res.status !== 400 || res.body.error?.code !== 'VALIDATION_ERROR') {
            throw new Error(`Expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject SKU creation with negative stock quantity', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/products/${productId}/skus`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                sku_code: 'ST-KB-FAIL-STOCK',
                price: 4999.00,
                stock_quantity: -5,
                variant_options: {
                    'Switch Type': 'Tactile Brown',
                    'Color': 'Arctic White'
                }
            });
        if (res.status !== 400 || res.body.error?.code !== 'VALIDATION_ERROR') {
            throw new Error(`Expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject SKU with invalid variant option value not in defined variant (CAT-04)', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/products/${productId}/skus`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                sku_code: 'ST-KB-INVALID-VAL',
                price: 4999.00,
                stock_quantity: 10,
                variant_options: {
                    'Switch Type': 'NonExistentSwitch',
                    'Color': 'Matte Black'
                }
            });
        if (res.status !== 400 || res.body.error?.code !== 'VALIDATION_ERROR') {
            throw new Error(`Expected 400 VALIDATION_ERROR for invalid variant option value, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject duplicate SKU code with 409 CONFLICT_ERROR', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/products/${productId}/skus`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                sku_code: 'ST-KB-BRN-BLK',
                price: 4999.00,
                stock_quantity: 10,
                variant_options: {
                    'Switch Type': 'Clicky Blue',
                    'Color': 'Arctic White'
                }
            });
        if (res.status !== 409 || res.body.error?.code !== 'CONFLICT_ERROR') {
            throw new Error(`Expected 409 CONFLICT_ERROR for duplicate SKU code, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject duplicate variant combination on same product with 409 CONFLICT_ERROR', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/products/${productId}/skus`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                sku_code: 'ST-KB-DUP-COMB',
                price: 4999.00,
                stock_quantity: 10,
                variant_options: {
                    'Switch Type': 'Tactile Brown',
                    'Color': 'Matte Black'
                }
            });
        if (res.status !== 409 || res.body.error?.code !== 'CONFLICT_ERROR') {
            throw new Error(`Expected 409 CONFLICT_ERROR for duplicate combination, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    // 7. Product Publishing & Aggregation
    await test('Publish product now that active sellable SKUs exist', async () => {
        const res = await request(app)
            .patch(`/api/v1/admin/products/${productId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                status: 'published'
            });
        if (res.status !== 200 || res.body.data?.status !== 'published') {
            throw new Error(`Expected status 'published', got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Admin can list products with aggregated SKU summary (total SKUs, price range, total inventory)', async () => {
        const res = await request(app)
            .get('/api/v1/admin/products')
            .set('Authorization', `Bearer ${adminToken}`);
        if (res.status !== 200 || !Array.isArray(res.body.data) || res.body.data.length === 0) {
            throw new Error(`Expected 200 with products array, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
        const prod = res.body.data.find(p => p.id === productId);
        if (!prod) {
            throw new Error('Created product not found in admin products list.');
        }
        if (prod.total_skus !== 2 || prod.total_stock !== 40) {
            throw new Error(`Aggregated SKU summary mismatch: total_skus=${prod.total_skus} (expected 2), total_stock=${prod.total_stock} (expected 40)`);
        }
        if (parseFloat(prod.min_price) !== 4999.00 || parseFloat(prod.max_price) !== 5299.00) {
            throw new Error(`Aggregated price range mismatch: min=${prod.min_price}, max=${prod.max_price}`);
        }
    });

    // 8. SKU Direct Updates
    await test('Admin can update SKU price, stock quantity, and active status directly', async () => {
        const res = await request(app)
            .patch(`/api/v1/admin/skus/${skuId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                price: 4799.00,
                stock_quantity: 30,
                is_active: true
            });
        if (res.status !== 200 || parseFloat(res.body.data?.price) !== 4799.00 || res.body.data?.stock_quantity !== 30) {
            throw new Error(`Expected updated price 4799 and stock 30, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject SKU update with negative price', async () => {
        const res = await request(app)
            .patch(`/api/v1/admin/skus/${skuId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                price: -50.00
            });
        if (res.status !== 400 || res.body.error?.code !== 'VALIDATION_ERROR') {
            throw new Error(`Expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    await test('Reject SKU update for non-existent SKU with 404 NOT_FOUND', async () => {
        const res = await request(app)
            .patch('/api/v1/admin/skus/99999')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                price: 1000.00
            });
        if (res.status !== 404 || res.body.error?.code !== 'NOT_FOUND') {
            throw new Error(`Expected 404 NOT_FOUND, got ${res.status}: ${JSON.stringify(res.body)}`);
        }
    });

    console.log('\n=====================================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('=====================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    runTests().catch(err => {
        console.error('Fatal test error:', err);
        process.exit(1);
    });
}

module.exports = { runTests };
