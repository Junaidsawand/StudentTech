const { pool } = require('./connection');

/**
 * Idempotent Catalog Seed Script for StudentTech
 * 
 * Seeds realistic Pakistani student-focused technology accessories across
 * hierarchical categories, products, variants, and sellable SKUs.
 */
async function seedCatalog(customClient = null) {
    const client = customClient || await pool.connect();
    const shouldRelease = !customClient;

    try {
        console.log('--- Starting StudentTech Catalog Seed Data Population ---');
        await client.query('BEGIN');

        // =========================================================================
        // 1. SEED CATEGORIES (Hierarchical: Parent & Child Levels)
        // =========================================================================
        console.log('[1/4] Seeding Category Taxonomy...');

        // Root Category 1: Computing & Study Hardware
        const rootCat1Res = await client.query(`
            INSERT INTO categories (name, slug, description, parent_id, is_active)
            VALUES ($1, $2, $3, NULL, TRUE)
            ON CONFLICT (slug) DO UPDATE 
            SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = EXCLUDED.is_active
            RETURNING id, name, slug;
        `, [
            'Computing & Study Hardware',
            'computing-study-hardware',
            'Essential computing hardware and ergonomic study accessories for university coursework.'
        ]);
        const rootCat1Id = rootCat1Res.rows[0].id;

        // Root Category 2: Power & Audio Essentials
        const rootCat2Res = await client.query(`
            INSERT INTO categories (name, slug, description, parent_id, is_active)
            VALUES ($1, $2, $3, NULL, TRUE)
            ON CONFLICT (slug) DO UPDATE 
            SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = EXCLUDED.is_active
            RETURNING id, name, slug;
        `, [
            'Power & Audio Essentials',
            'power-audio-essentials',
            'High-speed chargers, power banks, and noise-cancelling study audio gear.'
        ]);
        const rootCat2Id = rootCat2Res.rows[0].id;

        // Child Category 1.1: Mechanical Keyboards & Input
        const childCat1Res = await client.query(`
            INSERT INTO categories (name, slug, description, parent_id, is_active)
            VALUES ($1, $2, $3, $4, TRUE)
            ON CONFLICT (slug) DO UPDATE 
            SET name = EXCLUDED.name, description = EXCLUDED.description, parent_id = EXCLUDED.parent_id, is_active = EXCLUDED.is_active
            RETURNING id, name, slug;
        `, [
            'Mechanical Keyboards & Input',
            'mechanical-keyboards-input',
            'Compact and tactile mechanical keyboards optimized for coding and thesis typing.',
            rootCat1Id
        ]);
        const childCat1Id = childCat1Res.rows[0].id;

        // Child Category 2.1: Fast Chargers & Cables
        const childCat2Res = await client.query(`
            INSERT INTO categories (name, slug, description, parent_id, is_active)
            VALUES ($1, $2, $3, $4, TRUE)
            ON CONFLICT (slug) DO UPDATE 
            SET name = EXCLUDED.name, description = EXCLUDED.description, parent_id = EXCLUDED.parent_id, is_active = EXCLUDED.is_active
            RETURNING id, name, slug;
        `, [
            'Fast Chargers & Power Adapters',
            'fast-chargers-power-adapters',
            'High-wattage GaN chargers for laptops, tablets, and smartphones.',
            rootCat2Id
        ]);
        const childCat2Id = childCat2Res.rows[0].id;

        console.log(`  ✔ Categories seeded: 2 Parent Categories, 2 Subcategories.`);

        // =========================================================================
        // 2. SEED PRODUCTS (Published with Specifications)
        // =========================================================================
        console.log('[2/4] Seeding Student Technology Products...');

        // Product 1: StudentPro 75% Mechanical Keyboard
        const prod1Res = await client.query(`
            INSERT INTO products (category_id, name, slug, description, price, stock_quantity, status, specifications, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
            ON CONFLICT (slug) DO UPDATE 
            SET category_id = EXCLUDED.category_id,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                price = EXCLUDED.price,
                stock_quantity = EXCLUDED.stock_quantity,
                status = EXCLUDED.status,
                specifications = EXCLUDED.specifications,
                is_active = EXCLUDED.is_active,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, name, slug;
        `, [
            childCat1Id,
            'StudentPro Ergonomic 75% Mechanical Keyboard',
            'studentpro-ergo-75-keyboard',
            'Compact 75% mechanical keyboard designed for student study setups with wireless Bluetooth 5.3 and Type-C connectivity.',
            4999.00,
            60,
            'published',
            JSON.stringify({
                connectivity: 'Bluetooth 5.3 + Type-C USB + 2.4G Wireless',
                layout: '75% Compact 84-Key ANSI',
                battery_capacity: '3000mAh (Up to 120 hours)',
                backlight: 'White LED Multi-Mode'
            })
        ]);
        const prod1Id = prod1Res.rows[0].id;

        // Product 2: UniPower 65W GaN Fast Charger
        const prod2Res = await client.query(`
            INSERT INTO products (category_id, name, slug, description, price, stock_quantity, status, specifications, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
            ON CONFLICT (slug) DO UPDATE 
            SET category_id = EXCLUDED.category_id,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                price = EXCLUDED.price,
                stock_quantity = EXCLUDED.stock_quantity,
                status = EXCLUDED.status,
                specifications = EXCLUDED.specifications,
                is_active = EXCLUDED.is_active,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, name, slug;
        `, [
            childCat2Id,
            'UniPower 65W GaN Multi-Port Fast Charger',
            'unipower-65w-gan-fast-charger',
            'Ultra-compact Gallium Nitride (GaN) fast charger capable of charging a laptop and two phones simultaneously.',
            2850.00,
            55,
            'published',
            JSON.stringify({
                total_output: '65W Max',
                ports: '2x USB-C (PD 3.0) + 1x USB-A (QC 4.0)',
                protection: 'Over-voltage, temperature, and surge protection',
                weight: '120g'
            })
        ]);
        const prod2Id = prod2Res.rows[0].id;

        // Product 3: AcousticShield Pro ANC Study Headset
        const prod3Res = await client.query(`
            INSERT INTO products (category_id, name, slug, description, price, stock_quantity, status, specifications, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
            ON CONFLICT (slug) DO UPDATE 
            SET category_id = EXCLUDED.category_id,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                price = EXCLUDED.price,
                stock_quantity = EXCLUDED.stock_quantity,
                status = EXCLUDED.status,
                specifications = EXCLUDED.specifications,
                is_active = EXCLUDED.is_active,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, name, slug;
        `, [
            rootCat2Id,
            'AcousticShield Pro ANC Study Headset',
            'acousticshield-pro-anc-headset',
            'Active Noise Cancelling over-ear headset with dual ENC mics engineered for focused study in library and hostel environments.',
            3999.00,
            30,
            'published',
            JSON.stringify({
                anc_reduction: 'Up to -35dB Hybrid ANC',
                battery_hours: '40 Hours Playback (ANC ON)',
                microphone: 'Dual ENC Noise Cancelling Mic for Zoom & Teams',
                bluetooth: 'Bluetooth 5.3 + 3.5mm AUX Mode'
            })
        ]);
        const prod3Id = prod3Res.rows[0].id;

        console.log(`  ✔ Products seeded: 3 Products (All in 'published' status).`);

        // =========================================================================
        // 3. SEED PRODUCT VARIANTS
        // =========================================================================
        console.log('[3/4] Seeding Product Variant Definitions...');

        // Product 1 Variants: Switch Type & Color (Multi-Attribute Product)
        const p1VarSwitchRes = await client.query(`
            INSERT INTO variants (product_id, name, option_values)
            VALUES ($1, $2, $3)
            ON CONFLICT (product_id, name) DO UPDATE 
            SET option_values = EXCLUDED.option_values, updated_at = CURRENT_TIMESTAMP
            RETURNING id, product_id, name;
        `, [
            prod1Id,
            'Switch Type',
            JSON.stringify(['Tactile Brown', 'Silent Red', 'Clicky Blue'])
        ]);
        const p1VarSwitchId = p1VarSwitchRes.rows[0].id;

        const p1VarColorRes = await client.query(`
            INSERT INTO variants (product_id, name, option_values)
            VALUES ($1, $2, $3)
            ON CONFLICT (product_id, name) DO UPDATE 
            SET option_values = EXCLUDED.option_values, updated_at = CURRENT_TIMESTAMP
            RETURNING id, product_id, name;
        `, [
            prod1Id,
            'Color',
            JSON.stringify(['Matte Black', 'Arctic White'])
        ]);
        const p1VarColorId = p1VarColorRes.rows[0].id;

        // Product 2 Variant: Plug Type
        const p2VarPlugRes = await client.query(`
            INSERT INTO variants (product_id, name, option_values)
            VALUES ($1, $2, $3)
            ON CONFLICT (product_id, name) DO UPDATE 
            SET option_values = EXCLUDED.option_values, updated_at = CURRENT_TIMESTAMP
            RETURNING id, product_id, name;
        `, [
            prod2Id,
            'Plug Type',
            JSON.stringify(['UK 3-Pin (Pakistan Standard)', 'EU 2-Pin'])
        ]);
        const p2VarPlugId = p2VarPlugRes.rows[0].id;

        // Product 3 Variant: Color
        const p3VarColorRes = await client.query(`
            INSERT INTO variants (product_id, name, option_values)
            VALUES ($1, $2, $3)
            ON CONFLICT (product_id, name) DO UPDATE 
            SET option_values = EXCLUDED.option_values, updated_at = CURRENT_TIMESTAMP
            RETURNING id, product_id, name;
        `, [
            prod3Id,
            'Color',
            JSON.stringify(['Midnight Black', 'Silver Gray'])
        ]);
        const p3VarColorId = p3VarColorRes.rows[0].id;

        console.log(`  ✔ Variants seeded: 4 Variant attribute definitions.`);

        // =========================================================================
        // 4. SEED SELLABLE SKUs
        // =========================================================================
        console.log('[4/4] Seeding Sellable SKUs with Pricing & Stock...');

        // Product 1 SKUs (3 sellable SKUs out of 6 possible combinations)
        // NOTE: Combinations like {"Switch Type": "Clicky Blue", "Color": "Arctic White"}
        // are intentionally uninstantiated to model unavailable/unproduced variants cleanly.
        const skusToSeed = [
            // Product 1 SKUs
            {
                product_id: prod1Id,
                variant_id: p1VarSwitchId,
                sku_code: 'ST-KB-75-BRN-BLK',
                variant_options: { 'Switch Type': 'Tactile Brown', 'Color': 'Matte Black' },
                price: 4999.00,
                stock_quantity: 25,
                is_active: true
            },
            {
                product_id: prod1Id,
                variant_id: p1VarSwitchId,
                sku_code: 'ST-KB-75-RED-WHT',
                variant_options: { 'Switch Type': 'Silent Red', 'Color': 'Arctic White' },
                price: 5299.00,
                stock_quantity: 15,
                is_active: true
            },
            {
                product_id: prod1Id,
                variant_id: p1VarSwitchId,
                sku_code: 'ST-KB-75-BLU-BLK',
                variant_options: { 'Switch Type': 'Clicky Blue', 'Color': 'Matte Black' },
                price: 4799.00,
                stock_quantity: 20,
                is_active: true
            },
            // Product 2 SKUs
            {
                product_id: prod2Id,
                variant_id: p2VarPlugId,
                sku_code: 'ST-CHG-65W-UK',
                variant_options: { 'Plug Type': 'UK 3-Pin (Pakistan Standard)' },
                price: 2850.00,
                stock_quantity: 40,
                is_active: true
            },
            {
                product_id: prod2Id,
                variant_id: p2VarPlugId,
                sku_code: 'ST-CHG-65W-EU',
                variant_options: { 'Plug Type': 'EU 2-Pin' },
                price: 2850.00,
                stock_quantity: 15,
                is_active: true
            },
            // Product 3 SKU
            {
                product_id: prod3Id,
                variant_id: p3VarColorId,
                sku_code: 'ST-AUD-ANC-BLK',
                variant_options: { 'Color': 'Midnight Black' },
                price: 3999.00,
                stock_quantity: 30,
                is_active: true
            }
        ];

        let createdSkusCount = 0;
        for (const sku of skusToSeed) {
            await client.query(`
                INSERT INTO skus (product_id, variant_id, sku_code, variant_options, price, stock_quantity, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (sku_code) DO UPDATE 
                SET product_id = EXCLUDED.product_id,
                    variant_id = EXCLUDED.variant_id,
                    variant_options = EXCLUDED.variant_options,
                    price = EXCLUDED.price,
                    stock_quantity = EXCLUDED.stock_quantity,
                    is_active = EXCLUDED.is_active,
                    updated_at = CURRENT_TIMESTAMP;
            `, [
                sku.product_id,
                sku.variant_id,
                sku.sku_code,
                JSON.stringify(sku.variant_options),
                sku.price,
                sku.stock_quantity,
                sku.is_active
            ]);
            createdSkusCount++;
        }

        console.log(`  ✔ SKUs seeded: ${createdSkusCount} sellable SKUs with independent PKR pricing.`);

        await client.query('COMMIT');
        console.log('--- StudentTech Catalog Seed Completed Successfully ---\n');

        return {
            success: true,
            counts: {
                categories: 4,
                products: 3,
                variants: 4,
                skus: createdSkusCount
            }
        };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('✖ Seed operation failed:', err.message);
        throw err;
    } finally {
        if (shouldRelease) {
            client.release();
            await pool.end();
        }
    }
}

if (require.main === module) {
    seedCatalog().catch(err => {
        console.error('Fatal seed error:', err);
        process.exit(1);
    });
}

module.exports = { seedCatalog };
