-- =============================================================================
-- Migration 002: Sprint 2 Catalog Data Foundation
-- Project: StudentTech
-- Description: Extends Sprint 1 catalog model to multi-variant SKU architecture,
--              hierarchical categories, dynamic specifications, and asset entities.
-- =============================================================================

-- 1. EXTEND CATEGORIES TABLE FOR HIERARCHY & ACTIVE STATUS
ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS parent_id INTEGER NULL REFERENCES categories(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE categories
    ADD CONSTRAINT check_category_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);


-- 2. EXTEND PRODUCTS TABLE FOR IDENTITY, STATUS & SPECIFICATIONS
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS slug VARCHAR(200) NULL,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS specifications JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Populate slugs for any existing products missing a slug
UPDATE products
SET slug = LOWER(REGEXP_REPLACE(REPLACE(name, ' ', '-'), '[^a-zA-Z0-9\-]', '', 'g')) || '-' || CAST(id AS TEXT)
WHERE slug IS NULL;

-- Enforce NOT NULL and constraints on product slug, status, and specifications
ALTER TABLE products
    ALTER COLUMN slug SET NOT NULL;

ALTER TABLE products
    ADD CONSTRAINT uq_products_slug UNIQUE (slug),
    ADD CONSTRAINT check_product_status CHECK (status IN ('draft', 'published', 'archived')),
    ADD CONSTRAINT check_product_specifications_is_object CHECK (jsonb_typeof(specifications) = 'object');

CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_specifications ON products USING gin (specifications);


-- 3. CREATE VARIANTS TABLE
-- Represents configurable option groupings (e.g., Color, Storage Capacity, Cable Length)
CREATE TABLE IF NOT EXISTS variants (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    option_values JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_variant_name UNIQUE (product_id, name),
    CONSTRAINT check_variant_options_is_array CHECK (jsonb_typeof(option_values) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);


-- 4. CREATE SKUS (STOCK KEEPING UNITS) TABLE
-- Represents the sellable unit with its unique SKU code, price, stock, and status
CREATE TABLE IF NOT EXISTS skus (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id INTEGER NULL REFERENCES variants(id) ON DELETE SET NULL,
    sku_code VARCHAR(50) NOT NULL UNIQUE,
    variant_options JSONB NOT NULL DEFAULT '{}'::jsonb,
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_sku_price_non_negative CHECK (price >= 0.00),
    CONSTRAINT check_sku_stock_non_negative CHECK (stock_quantity >= 0),
    CONSTRAINT check_sku_variant_options_is_object CHECK (jsonb_typeof(variant_options) = 'object'),
    CONSTRAINT uq_product_variant_options UNIQUE (product_id, variant_options)
);

CREATE INDEX IF NOT EXISTS idx_skus_product_id ON skus(product_id);
CREATE INDEX IF NOT EXISTS idx_skus_variant_id ON skus(variant_id);
CREATE INDEX IF NOT EXISTS idx_skus_code ON skus(sku_code);
CREATE INDEX IF NOT EXISTS idx_skus_is_active ON skus(is_active);


-- 5. CREATE ASSETS TABLE
-- Represents media assets linked to products, variants, or individual SKUs
CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    product_id INTEGER NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER NULL REFERENCES variants(id) ON DELETE SET NULL,
    sku_id INTEGER NULL REFERENCES skus(id) ON DELETE SET NULL,
    url VARCHAR(500) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'detail',
    alt_text VARCHAR(255) NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_asset_role CHECK (role IN ('hero', 'detail', 'swatch')),
    CONSTRAINT check_asset_owner CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL OR sku_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_assets_product_id ON assets(product_id);
CREATE INDEX IF NOT EXISTS idx_assets_variant_id ON assets(variant_id);
CREATE INDEX IF NOT EXISTS idx_assets_sku_id ON assets(sku_id);


-- 6. EXTEND DOWNSTREAM CART & ORDER ITEMS FOR SKU LINKAGE
-- Prepares the catalog model for Sprint 3+ workflows without breaking Sprint 1 compatibility
ALTER TABLE cart_items
    ADD COLUMN IF NOT EXISTS sku_id INTEGER NULL REFERENCES skus(id) ON DELETE RESTRICT;

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS sku_id INTEGER NULL REFERENCES skus(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_cart_items_sku_id ON cart_items(sku_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku_id ON order_items(sku_id);
