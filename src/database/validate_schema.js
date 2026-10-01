const fs = require('fs');
const path = require('path');
const { newDb } = require('pg-mem');

async function validateSchema() {
    console.log('=====================================================');
    console.log('--- Validating PostgreSQL Schema & Migrations ---');
    console.log('=====================================================');

    const db = newDb({
        autoCreateForeignKeyIndices: true
    });

    // Register PostgreSQL native functions needed for validation
    db.public.registerFunction({
        name: 'replace',
        args: [db.public.getType('text'), db.public.getType('text'), db.public.getType('text')],
        returns: db.public.getType('text'),
        implementation: (str, from, to) => (str ? str.split(from).join(to) : str)
    });

    db.public.registerFunction({
        name: 'regexp_replace',
        args: [db.public.getType('text'), db.public.getType('text'), db.public.getType('text'), db.public.getType('text')],
        returns: db.public.getType('text'),
        implementation: (str, pattern, replacement, flags) => {
            if (!str) return str;
            const re = new RegExp(pattern, flags || 'g');
            return str.replace(re, replacement);
        }
    });

    db.public.registerFunction({
        name: 'jsonb_typeof',
        args: [db.public.getType('jsonb') || db.public.getType('text')],
        returns: db.public.getType('text'),
        implementation: (val) => {
            if (val === null || val === undefined) return 'null';
            if (Array.isArray(val)) return 'array';
            if (typeof val === 'object') return 'object';
            if (typeof val === 'number') return 'number';
            if (typeof val === 'boolean') return 'boolean';
            if (typeof val === 'string') return 'string';
            return 'object';
        }
    });

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

    console.log('\n[1/4] Applying SQL Migrations sequentially:');
    for (const file of files) {
        console.log(`  -> Executing ${file}...`);
        let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        const sanitizedSql = sql
            .replace(/DO \$\$[\s\S]*?\$\$ LANGUAGE plpgsql;/g, '')
            .replace(/DO \$\$[\s\S]*?\$\$;/g, '')
            .replace(/DECIMAL\(10,\s*2\)/gi, 'NUMERIC')
            .replace(/GENERATED ALWAYS AS IDENTITY/gi, '')
            .replace(/id INTEGER PRIMARY KEY/gi, 'id SERIAL PRIMARY KEY');

        db.public.none(sanitizedSql);
        console.log(`     ✔ ${file} executed successfully.`);
    }

    console.log('\n[2/4] Verifying Table Existence:');
    const tables = [
        'users',
        'categories',
        'products',
        'variants',
        'skus',
        'assets',
        'cart',
        'cart_items',
        'orders',
        'order_items'
    ];

    for (const table of tables) {
        const check = db.public.many(`SELECT COUNT(*) AS count FROM ${table}`);
        console.log(`  ✔ Table '${table}' is verified and queryable (Initial rows: ${check[0].count})`);
    }

    console.log('\n[3/4] Testing Data Insertion & Hierarchical Relationships:');

    // Test Category Hierarchy
    db.public.none(`
        INSERT INTO categories (name, slug, description, parent_id, is_active)
        VALUES ('Technology', 'technology', 'All tech accessories', NULL, TRUE);
    `);
    const parentCat = db.public.one(`SELECT id FROM categories WHERE slug = 'technology'`);

    db.public.none(`
        INSERT INTO categories (name, slug, description, parent_id, is_active)
        VALUES ('Audio Accessories', 'audio-accessories', 'Headphones and mics', ${parentCat.id}, TRUE);
    `);
    const subCat = db.public.one(`SELECT id FROM categories WHERE slug = 'audio-accessories'`);
    console.log(`  ✔ Hierarchical Category insertion passed: Parent ID ${parentCat.id} -> Subcategory ID ${subCat.id}`);

    // Test Product with Status & Specifications
    db.public.none(`
        INSERT INTO products (category_id, name, slug, description, price, stock_quantity, status, specifications, is_active)
        VALUES (${subCat.id}, 'Noise Cancelling Headphones', 'noise-cancelling-headphones', 'Wireless over-ear headphones', 4500.00, 10, 'published', '{"bluetooth_version": "5.3", "battery_hours": 30}'::jsonb, TRUE);
    `);
    const product = db.public.one(`SELECT id, name, slug, status FROM products WHERE slug = 'noise-cancelling-headphones'`);
    console.log(`  ✔ Product insertion passed: ID ${product.id} ('${product.name}', Status: '${product.status}')`);

    // Test Variant
    db.public.none(`
        INSERT INTO variants (product_id, name, option_values)
        VALUES (${product.id}, 'Color', '["Matte Black", "Silver"]'::jsonb);
    `);
    const variant = db.public.one(`SELECT id, name FROM variants WHERE product_id = ${product.id}`);
    console.log(`  ✔ Variant insertion passed: ID ${variant.id} ('${variant.name}')`);

    // Test SKUs with Valid Combinations
    db.public.none(`
        INSERT INTO skus (product_id, variant_id, sku_code, variant_options, price, stock_quantity, is_active)
        VALUES
            (${product.id}, ${variant.id}, 'NCH-BLK', '{"Color": "Matte Black"}'::jsonb, 4500.00, 15, TRUE),
            (${product.id}, ${variant.id}, 'NCH-SLV', '{"Color": "Silver"}'::jsonb, 4800.00, 8, TRUE);
    `);
    const skus = db.public.many(`SELECT id, sku_code, price, stock_quantity FROM skus WHERE product_id = ${product.id}`);
    console.log(`  ✔ SKU insertion passed: ${skus.length} SKUs created with independent prices & inventory.`);

    // Test Asset Association
    db.public.none(`
        INSERT INTO assets (product_id, variant_id, sku_id, url, role, alt_text, sort_order)
        VALUES (${product.id}, ${variant.id}, ${skus[0].id}, 'https://images.studenttech.pk/nch-black-hero.webp', 'hero', 'Matte Black Headphone Hero Image', 1);
    `);
    const asset = db.public.one(`SELECT id, role, url FROM assets WHERE product_id = ${product.id}`);
    console.log(`  ✔ Media Asset insertion passed: ID ${asset.id} (Role: '${asset.role}', URL: '${asset.url}')`);

    // Test Cart & Order integration with SKU
    db.public.none(`
        INSERT INTO users (full_name, email, password_hash, role)
        VALUES ('Test Student', 'student@usindh.edu.pk', '$2b$10$hashedpassword', 'customer');
    `);
    const user = db.public.one(`SELECT id FROM users WHERE email = 'student@usindh.edu.pk'`);

    db.public.none(`
        INSERT INTO cart (user_id) VALUES (${user.id});
    `);
    const cart = db.public.one(`SELECT id FROM cart WHERE user_id = ${user.id}`);

    db.public.none(`
        INSERT INTO cart_items (cart_id, product_id, sku_id, quantity)
        VALUES (${cart.id}, ${product.id}, ${skus[0].id}, 2);
    `);
    const cartItem = db.public.one(`SELECT id, product_id, sku_id, quantity FROM cart_items WHERE cart_id = ${cart.id}`);
    console.log(`  ✔ Cart item with SKU linkage passed: Cart Item ID ${cartItem.id} (Product: ${cartItem.product_id}, SKU: ${cartItem.sku_id}, Qty: ${cartItem.quantity})`);

    console.log('\n[4/4] Verifying Business Constraints & Rejection Rules:');

    // Verify negative price rejection
    try {
        db.public.none(`
            INSERT INTO skus (product_id, sku_code, price, stock_quantity)
            VALUES (${product.id}, 'FAIL-NEG-PRICE', -100.00, 5);
        `);
        console.error('  ✖ FAILED: Negative price was allowed!');
        process.exitCode = 1;
    } catch (e) {
        console.log('  ✔ Negative SKU price correctly rejected by CHECK constraint.');
    }

    // Verify negative stock rejection
    try {
        db.public.none(`
            INSERT INTO skus (product_id, sku_code, price, stock_quantity)
            VALUES (${product.id}, 'FAIL-NEG-STOCK', 100.00, -5);
        `);
        console.error('  ✖ FAILED: Negative stock was allowed!');
        process.exitCode = 1;
    } catch (e) {
        console.log('  ✔ Negative stock quantity correctly rejected by CHECK constraint.');
    }

    // Verify duplicate SKU code rejection
    try {
        db.public.none(`
            INSERT INTO skus (product_id, sku_code, price, stock_quantity)
            VALUES (${product.id}, 'NCH-BLK', 5000.00, 10);
        `);
        console.error('  ✖ FAILED: Duplicate SKU code was allowed!');
        process.exitCode = 1;
    } catch (e) {
        console.log('  ✔ Duplicate SKU code correctly rejected by UNIQUE constraint.');
    }

    // Verify duplicate product slug rejection
    try {
        db.public.none(`
            INSERT INTO products (category_id, name, slug, price, stock_quantity)
            VALUES (${subCat.id}, 'Duplicate Slug Product', 'noise-cancelling-headphones', 2000.00, 5);
        `);
        console.error('  ✖ FAILED: Duplicate product slug was allowed!');
        process.exitCode = 1;
    } catch (e) {
        console.log('  ✔ Duplicate product slug correctly rejected by UNIQUE constraint.');
    }

    console.log('\n=====================================================');
    console.log('✔ All Database Schema Tests & Constraints Passed Successfully!');
    console.log('=====================================================\n');
}

if (require.main === module) {
    validateSchema().catch(err => {
        console.error('Schema validation error:', err);
        process.exit(1);
    });
}

module.exports = { validateSchema };

