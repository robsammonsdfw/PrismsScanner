import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
    ssl: {
        rejectUnauthorized: false
    }
});

// --- Schema Management ---
let _schemaChecked = false;

const ensureDatabaseSchema = async (client) => {
    if (_schemaChecked) return;

    // Ensure the users table exists (Shared with main app)
    await client.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL);`);

    // Ensure body_scans table exists (Specific to this app, but part of shared DB)
    await client.query(`
        CREATE TABLE IF NOT EXISTS body_scans (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            scan_data JSONB NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_body_scans_user_id ON body_scans(user_id);`);

    _schemaChecked = true;
};

// --- User Logic (Required for Auth validation) ---

export const findOrCreateUserByEmail = async (email) => {
    const client = await pool.connect();
    try {
        await ensureDatabaseSchema(client);

        const insertQuery = `
            INSERT INTO users (email) 
            VALUES ($1) 
            ON CONFLICT (email) 
            DO NOTHING;
        `;
        await client.query(insertQuery, [email]);

        const selectQuery = `SELECT id, email FROM users WHERE email = $1;`;
        const res = await client.query(selectQuery, [email]);
        
        if (res.rows.length === 0) {
            throw new Error("Failed to find or create user after insert operation.");
        }
        return res.rows[0];

    } catch (err) {
        console.error('Database error in findOrCreateUserByEmail:', err);
        throw new Error('Could not retrieve user data.');
    } finally {
        client.release();
    }
};

// --- Body Scans Persistence ---

export const saveBodyScan = async (userId, scanData) => {
    const client = await pool.connect();
    try {
        await ensureDatabaseSchema(client);
        
        const query = `
            INSERT INTO body_scans (user_id, scan_data)
            VALUES ($1, $2)
            RETURNING id, scan_data, created_at;
        `;
        const res = await client.query(query, [userId, scanData]);
        return res.rows[0];
    } catch (err) {
        console.error('Database error in saveBodyScan:', err);
        throw new Error('Could not save body scan.');
    } finally {
        client.release();
    }
};

export const getBodyScans = async (userId) => {
    const client = await pool.connect();
    try {
        await ensureDatabaseSchema(client);

        const query = `
            SELECT id, scan_data, created_at
            FROM body_scans
            WHERE user_id = $1
            ORDER BY created_at DESC;
        `;
        const res = await client.query(query, [userId]);
        return res.rows;
    } catch (err) {
        console.error('Database error in getBodyScans:', err);
        throw new Error('Could not retrieve body scans.');
    } finally {
        client.release();
    }
};