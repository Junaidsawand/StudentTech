const fs = require('fs');
const path = require('path');
const { pool } = require('./connection');

async function runMigrations() {
    const client = await pool.connect();
    try {
        console.log('--- Starting PostgreSQL Database Migrations ---');

        // Ensure schema_migrations tracker table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                migration_name VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const { rows } = await client.query(
                'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
                [file]
            );

            if (rows.length === 0) {
                console.log(`Applying migration: ${file}...`);
                const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

                await client.query('BEGIN');
                try {
                    await client.query(sql);
                    await client.query(
                        'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
                        [file]
                    );
                    await client.query('COMMIT');
                    console.log(`✔ Successfully applied: ${file}`);
                } catch (migrationError) {
                    await client.query('ROLLBACK');
                    console.error(`✖ Error applying migration ${file}:`, migrationError);
                    throw migrationError;
                }
            } else {
                console.log(`- Skipping already applied migration: ${file}`);
            }
        }

        console.log('--- All Database Migrations Completed Successfully ---');
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    runMigrations();
}

module.exports = { runMigrations };
