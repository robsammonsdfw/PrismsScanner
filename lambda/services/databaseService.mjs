import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
    ssl: {
        rejectUnauthorized: false
    }
});

/**
 * Helper function to prepare meal data for database insertion.
 */
const processMealDataForSave = (mealData) => {
    const dataForDb = { ...mealData };
    if (dataForDb.imageUrl && dataForDb.imageUrl.startsWith('data:image')) {
        dataForDb.imageBase64 = dataForDb.imageUrl.split(',')[1];
        delete dataForDb.imageUrl;
    }
    delete dataForDb.id;
    delete dataForDb.createdAt;
    return dataForDb;
};

/**
 * Helper function to prepare meal data for the client.
 */
const processMealDataForClient = (mealData) => {
    const dataForClient = { ...mealData };
    if (dataForClient.imageBase64) {
        dataForClient.imageUrl = `data:image/jpeg;base64,${dataForClient.imageBase64}`;
        delete dataForClient.imageBase64;
    }
    return dataForClient;
};

// --- Schema Management ---
let _schemaChecked = false;

const ensureDatabaseSchema = async (client) => {
    if (_schemaChecked) return;

    // 1. Rewards Tables
    await client.query(`
        CREATE TABLE IF NOT EXISTS rewards_balances (
            user_id VARCHAR(255) PRIMARY KEY,
            points_total INT DEFAULT 0,
            points_available INT DEFAULT 0,
            tier VARCHAR(50) DEFAULT 'Bronze',
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS rewards_ledger (
            entry_id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            points_delta INT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            metadata JSONB DEFAULT '{}'
        );
    `);

    // 2. Core App Tables (Ensure existence)
    await client.query(`CREATE TABLE IF NOT EXISTS saved_meals (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL, meal_data JSONB, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);`);
    await client.query(`CREATE TABLE IF NOT EXISTS meal_plans (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);`);
    await client.query(`CREATE TABLE IF NOT EXISTS meal_plan_items (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL, meal_plan_id INT NOT NULL, saved_meal_id INT NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);`);
    await client.query(`CREATE TABLE IF NOT EXISTS meal_log_entries (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL, meal_data JSONB, image_base64 TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);`);
    await client.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL);`);

    // 3. Grocery List Tables (New Schema)
    await client.query(`
        CREATE TABLE IF NOT EXISTS grocery_lists (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            is_active BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Ensure grocery_list_items exists (handle both legacy and new)
    await client.query(`
        CREATE TABLE IF NOT EXISTS grocery_list_items (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            checked BOOLEAN DEFAULT FALSE,
            grocery_list_id INT
        );
    `);

    // Add grocery_list_id to items if it doesn't exist (Migration for legacy tables)
    try {
        await client.query(`ALTER TABLE grocery_list_items ADD COLUMN IF NOT EXISTS grocery_list_id INT;`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_grocery_list_items_list_id ON grocery_list_items(grocery_list_id);`);
    } catch (e) {
        console.log("Info: Grocery list schema update skipped or failed (might already exist):", e.message);
    }

    // 4. Body Scans Table (New for Prism App)
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


export const findOrCreateUserByEmail = async (email) => {
    const client = await pool.connect();
    try {
        // Ensure schema is up to date when user logs in
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
        
        // Ensure rewards balance entry exists for this user
        await client.query(`
            INSERT INTO rewards_balances (user_id, points_total, points_available, tier)
            VALUES ($1, 0, 0, 'Bronze')
            ON CONFLICT (user_id) DO NOTHING;
        `, [res.rows[0].id]);

        return res.rows[0];

    } catch (err) {
        console.error('Database error in findOrCreateUserByEmail:', err);
        throw new Error('Could not save or retrieve user data from the database.');
    } finally {
        client.release();
    }
};


// --- Rewards Logic ---

export const awardPoints = async (userId, eventType, points, metadata = {}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Insert into ledger
        await client.query(`
            INSERT INTO rewards_ledger (user_id, event_type, points_delta, metadata)
            VALUES ($1, $2, $3, $4)
        `, [userId, eventType, points, metadata]);

        // 2. Update balances
        const updateRes = await client.query(`
            UPDATE rewards_balances
            SET points_total = points_total + $2,
                points_available = points_available + $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1
            RETURNING points_total
        `, [userId, points]);
        
        // 3. Recalculate Tier
        const newTotal = updateRes.rows[0].points_total;
        let newTier = 'Bronze';
        if (newTotal >= 5000) newTier = 'Platinum';
        else if (newTotal >= 1000) newTier = 'Gold';
        else if (newTotal >= 200) newTier = 'Silver';

        await client.query(`
            UPDATE rewards_balances SET tier = $2 WHERE user_id = $1
        `, [userId, newTier]);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error awarding points:', err);
    } finally {
        client.release();
    }
};

export const getRewardsSummary = async (userId) => {
    const client = await pool.connect();
    try {
        const balanceRes = await client.query(`
            SELECT points_total, points_available, tier 
            FROM rewards_balances WHERE user_id = $1
        `, [userId]);
        
        const historyRes = await client.query(`
            SELECT entry_id, event_type, points_delta, created_at, metadata
            FROM rewards_ledger
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 50
        `, [userId]);

        const balance = balanceRes.rows[0] || { points_total: 0, points_available: 0, tier: 'Bronze' };

        return {
            ...balance,
            history: historyRes.rows
        };
    } catch (err) {
        console.error('Error getting rewards summary:', err);
        throw new Error('Could not retrieve rewards.');
    } finally {
        client.release();
    }
};


// --- Meal Log (History) Persistence ---

export const createMealLogEntry = async (userId, mealData, imageBase64) => {
    const client = await pool.connect();
    try {
        const query = `
            INSERT INTO meal_log_entries (user_id, meal_data, image_base64)
            VALUES ($1, $2, $3)
            RETURNING id, meal_data, image_base64, created_at;
        `;
        const res = await client.query(query, [userId, mealData, imageBase64]);
        const row = res.rows[0];
        
        await awardPoints(userId, 'meal_photo.logged', 50, { meal_log_id: row.id });

        const mealDataFromDb = row.meal_data && typeof row.meal_data === 'object' ? row.meal_data : {};
        return { 
            id: row.id,
            ...mealDataFromDb,
            imageUrl: `data:image/jpeg;base64,${row.image_base64}`,
            hasImage: true,
            createdAt: row.created_at
        };
    } catch (err) {
        console.error('Database error in createMealLogEntry:', err);
        throw new Error('Could not save meal to history.');
    } finally {
        client.release();
    }
};


export const getMealLogEntries = async (userId) => {
    const client = await pool.connect();
    try {
        const query = `
            SELECT id, meal_data, created_at,
            (image_base64 IS NOT NULL AND length(image_base64) > 0) as has_image
            FROM meal_log_entries
            WHERE user_id = $1 
            ORDER BY created_at DESC;
        `;
        const res = await client.query(query, [userId]);
        return res.rows.map(row => {
            const mealData = row.meal_data && typeof row.meal_data === 'object' ? row.meal_data : {};
            return {
                id: row.id,
                ...mealData,
                imageUrl: undefined, // Don't send the full image list
                hasImage: row.has_image,
                createdAt: row.created_at,
            };
        });
    } catch (err) {
        console.error('Database error in getMealLogEntries:', err);
        throw new Error('Could not retrieve meal history.');
    } finally {
        client.release();
    }
};

export const getMealLogEntryById = async (userId, logId) => {
    const client = await pool.connect();
    try {
        const query = `
            SELECT id, meal_data, image_base64, created_at 
            FROM meal_log_entries
            WHERE id = $1 AND user_id = $2;
        `;
        const res = await client.query(query, [logId, userId]);
        if (res.rows.length === 0) return null;
        
        const row = res.rows[0];
        const mealData = row.meal_data && typeof row.meal_data === 'object' ? row.meal_data : {};
        
        return {
            id: row.id,
            ...mealData,
            imageUrl: `data:image/jpeg;base64,${row.image_base64}`,
            hasImage: !!row.image_base64,
            createdAt: row.created_at
        };
    } catch (err) {
        console.error('Database error in getMealLogEntryById:', err);
        throw new Error('Could not retrieve meal log entry.');
    } finally {
        client.release();
    }
};

// --- Saved Meals Persistence ---

export const getSavedMeals = async (userId) => {
    const client = await pool.connect();
    try {
        const query = `
            SELECT id, meal_data - 'imageBase64' as meal_data,
            (meal_data->>'imageBase64' IS NOT NULL AND length(meal_data->>'imageBase64') > 0) as has_image,
            created_at
            FROM saved_meals 
            WHERE user_id = $1 
            ORDER BY created_at DESC;
        `;
        const res = await client.query(query, [userId]);
        return res.rows.map(row => {
            const mealData = row.meal_data && typeof row.meal_data === 'object' ? row.meal_data : {};
            return { 
                id: row.id, 
                ...processMealDataForClient(mealData),
                hasImage: row.has_image
            };
        });
    } catch (err) {
        console.error('Database error in getSavedMeals:', err);
        throw new Error('Could not retrieve saved meals.');
    } finally {
        client.release();
    }
};

export const getSavedMealById = async (userId, mealId) => {
    const client = await pool.connect();
    try {
        const query = `SELECT id, meal_data FROM saved_meals WHERE id = $1 AND user_id = $2;`;
        const res = await client.query(query, [mealId, userId]);
        if (res.rows.length === 0) return null;
        
        const row = res.rows[0];
        const mealData = row.meal_data && typeof row.meal_data === 'object' ? row.meal_data : {};
        return { 
            id: row.id, 
            ...processMealDataForClient(mealData),
            hasImage: !!mealData.imageBase64
        };
    } catch (err) {
        console.error('Database error in getSavedMealById:', err);
        throw new Error('Could not retrieve saved meal.');
    } finally {
        client.release();
    }
};

export const saveMeal = async (userId, mealData) => {
    const client = await pool.connect();
    try {
        const mealDataForDb = processMealDataForSave(mealData);
        const query = `
            INSERT INTO saved_meals (user_id, meal_data) 
            VALUES ($1, $2) 
            RETURNING id, meal_data;
        `;
        const res = await client.query(query, [userId, mealDataForDb]);
        const row = res.rows[0];
        
        await awardPoints(userId, 'meal.saved', 10, { saved_meal_id: row.id });
        
        const mealDataFromDb = row.meal_data && typeof row.meal_data === 'object' ? row.meal_data : {};

        return { 
            id: row.id, 
            ...processMealDataForClient(mealDataFromDb),
            hasImage: !!mealDataForDb.imageBase64
        };
    } catch (err) {
        console.error('Database error in saveMeal:', err);
        throw new Error('Could not save meal.');
    } finally {
        client.release();
    }
};

export const deleteMeal = async (userId, mealId) => {
    const client = await pool.connect();
    try {
        await client.query(`DELETE FROM saved_meals WHERE id = $1 AND user_id = $2;`, [mealId, userId]);
    } catch (err) {
        console.error('Database error in deleteMeal:', err);
        throw new Error('Could not delete meal.');
    } finally {
        client.release();
    }
};

// --- Meal Plans Persistence ---

export const getMealPlans = async (userId) => {
    const client = await pool.connect();
    try {
        const query = `
            SELECT 
                p.id as plan_id, p.name as plan_name,
                i.id as item_id,
                sm.id as meal_id, sm.meal_data - 'imageBase64' as meal_data,
                (sm.meal_data->>'imageBase64' IS NOT NULL AND length(sm.meal_data->>'imageBase64') > 0) as has_image
            FROM meal_plans p
            LEFT JOIN meal_plan_items i ON p.id = i.meal_plan_id
            LEFT JOIN saved_meals sm ON i.saved_meal_id = sm.id
            WHERE p.user_id = $1
            ORDER BY p.name, i.created_at;
        `;
        const res = await client.query(query, [userId]);
        
        const plans = new Map();
        res.rows.forEach(row => {
            if (!plans.has(row.plan_id)) {
                plans.set(row.plan_id, {
                    id: row.plan_id,
                    name: row.plan_name,
                    items: [],
                });
            }
            if (row.item_id) { 
                const mealData = row.meal_data && typeof row.meal_data === 'object' ? row.meal_data : {};
                plans.get(row.plan_id).items.push({
                    id: row.item_id,
                    meal: {
                        id: row.meal_id,
                        ...processMealDataForClient(mealData),
                        hasImage: row.has_image
                    }
                });
            }
        });
        return Array.from(plans.values());
    } catch (err) {
        console.error('Database error in getMealPlans:', err);
        throw new Error('Could not retrieve meal plans.');
    } finally {
        client.release();
    }
};

export const createMealPlan = async (userId, name) => {
    const client = await pool.connect();
    try {
        const query = `INSERT INTO meal_plans (user_id, name) VALUES ($1, $2) RETURNING id, name;`;
        const res = await client.query(query, [userId, name]);
        return { ...res.rows[0], items: [] }; 
    } catch(err) {
        if (err.code === '23505') { 
            throw new Error(`A meal plan with the name "${name}" already exists.`);
        }
        console.error('Database error in createMealPlan:', err);
        throw new Error('Could not create meal plan.');
    } finally {
        client.release();
    }
};

export const deleteMealPlan = async (userId, planId) => {
    const client = await pool.connect();
    try {
        await client.query(`DELETE FROM meal_plans WHERE id = $1 AND user_id = $2;`, [planId, userId]);
    } catch(err) {
        console.error('Database error in deleteMealPlan:', err);
        throw new Error('Could not delete meal plan.');
    } finally {
        client.release();
    }
};


export const addMealToPlanItem = async (userId, planId, savedMealId) => {
    const client = await pool.connect();
    try {
        const checkQuery = `
           SELECT (SELECT user_id FROM meal_plans WHERE id = $1) = $3 AS owns_plan,
                  (SELECT user_id FROM saved_meals WHERE id = $2) = $3 AS owns_meal;
        `;
        const checkRes = await client.query(checkQuery, [planId, savedMealId, userId]);
        if (!checkRes.rows[0] || !checkRes.rows[0].owns_plan || !checkRes.rows[0].owns_meal) {
            throw new Error("Authorization error: Cannot add meal to a plan you don't own, or meal/plan does not exist.");
        }

        const insertQuery = `
            INSERT INTO meal_plan_items (user_id, meal_plan_id, saved_meal_id)
            VALUES ($1, $2, $3)
            RETURNING id;
        `;
        const insertRes = await client.query(insertQuery, [userId, planId, savedMealId]);
        const newItemId = insertRes.rows[0].id;

        const selectQuery = `
            SELECT 
                i.id,
                m.id as meal_id,
                m.meal_data - 'imageBase64' as meal_data,
                (m.meal_data->>'imageBase64' IS NOT NULL AND length(m.meal_data->>'imageBase64') > 0) as has_image
            FROM meal_plan_items i
            JOIN saved_meals m ON i.saved_meal_id = m.id
            WHERE i.id = $1;
        `;
        const selectRes = await client.query(selectQuery, [newItemId]);
        const row = selectRes.rows[0];
        const mealData = row.meal_data && typeof row.meal_data === 'object' ? row.meal_data : {};
        return {
            id: row.id,
            meal: { 
                id: row.meal_id, 
                ...processMealDataForClient(mealData),
                hasImage: row.has_image
            }
        };

    } catch (err) {
        if (err.code === '23505') { 
            console.warn(`Meal ${savedMealId} is already in plan ${planId}.`);
            throw new Error('This meal is already in the selected plan.');
        }
        console.error('Database error in addMealToPlanItem:', err);
        throw new Error('Could not add meal to plan.');
    } finally {
        client.release();
    }
};


export const addMealAndLinkToPlan = async (userId, mealData, planId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const newMeal = await saveMeal(userId, mealData);
        const newPlanItem = await addMealToPlanItem(userId, planId, newMeal.id);
        await client.query('COMMIT');
        return newPlanItem;
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database transaction error in addMealAndLinkToPlan:', err);
        throw new Error('Could not add meal from history to plan due to a database error.');
    } finally {
        client.release();
    }
};

export const removeMealFromPlanItem = async (userId, planItemId) => {
    const client = await pool.connect();
    try {
        await client.query(`DELETE FROM meal_plan_items WHERE id = $1 AND user_id = $2;`, [planItemId, userId]);
    } catch (err) {
        console.error('Database error in removeMealFromPlanItem:', err);
        throw new Error('Could not remove meal from plan.');
    } finally {
        client.release();
    }
};


// --- Grocery List Persistence ---

export const getGroceryLists = async (userId) => {
    const client = await pool.connect();
    try {
        await ensureDatabaseSchema(client);
        // ... legacy check omitted for brevity, assuming established schema ...

        const query = `
            SELECT id, name, is_active, created_at 
            FROM grocery_lists 
            WHERE user_id = $1 
            ORDER BY is_active DESC, created_at DESC;
        `;
        const res = await client.query(query, [userId]);
        
        if (res.rows.length === 0) {
             const insertList = `INSERT INTO grocery_lists (user_id, name, is_active) VALUES ($1, 'My List', TRUE) RETURNING id, name, is_active, created_at`;
             const newRes = await client.query(insertList, [userId]);
             return newRes.rows;
        }

        return res.rows;
    } catch (err) {
        console.error('Database error in getGroceryLists:', err);
        throw new Error('Could not retrieve grocery lists.');
    } finally {
        client.release();
    }
};

export const createGroceryList = async (userId, name) => {
    const client = await pool.connect();
    try {
        const query = `INSERT INTO grocery_lists (user_id, name) VALUES ($1, $2) RETURNING id, name, is_active, created_at;`;
        const res = await client.query(query, [userId, name]);
        return res.rows[0];
    } catch (err) {
        console.error('Database error in createGroceryList:', err);
        throw new Error('Could not create grocery list.');
    } finally {
        client.release();
    }
};

export const setActiveGroceryList = async (userId, listId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE grocery_lists SET is_active = FALSE WHERE user_id = $1', [userId]);
        await client.query('UPDATE grocery_lists SET is_active = TRUE WHERE user_id = $1 AND id = $2', [userId, listId]);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database error in setActiveGroceryList:', err);
        throw new Error('Could not set active list.');
    } finally {
        client.release();
    }
};

export const deleteGroceryList = async (userId, listId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM grocery_list_items WHERE grocery_list_id = $1', [listId]);
        await client.query('DELETE FROM grocery_lists WHERE id = $1 AND user_id = $2', [listId, userId]);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database error in deleteGroceryList:', err);
        throw new Error('Could not delete grocery list.');
    } finally {
        client.release();
    }
};

export const getGroceryListItems = async (userId, listId) => {
    const client = await pool.connect();
    try {
        const query = `
            SELECT i.id, i.name, i.checked 
            FROM grocery_list_items i
            JOIN grocery_lists l ON i.grocery_list_id = l.id
            WHERE l.id = $1 AND l.user_id = $2
            ORDER BY i.name ASC;
        `;
        const res = await client.query(query, [listId, userId]);
        return res.rows;
    } catch (err) {
        console.error('Database error in getGroceryListItems:', err);
        throw new Error('Could not retrieve grocery list items.');
    } finally {
        client.release();
    }
};

export const generateGroceryList = async (userId, planIds = [], listName) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const createListQuery = `INSERT INTO grocery_lists (user_id, name, is_active) VALUES ($1, $2, TRUE) RETURNING id;`;
        const listRes = await client.query(createListQuery, [userId, listName]);
        const newListId = listRes.rows[0].id;
        
        await client.query('UPDATE grocery_lists SET is_active = FALSE WHERE user_id = $1 AND id != $2', [userId, newListId]);

        if (planIds.length > 0) {
            const mealQuery = `
                SELECT sm.meal_data
                FROM saved_meals sm
                JOIN meal_plan_items mpi ON sm.id = mpi.saved_meal_id
                WHERE mpi.user_id = $1 AND mpi.meal_plan_id = ANY($2::int[]);
            `;
            const mealRes = await client.query(mealQuery, [userId, planIds]);
            const allIngredients = mealRes.rows.flatMap(row => row.meal_data?.ingredients || []);
            const uniqueIngredientNames = [...new Set(allIngredients.map(ing => ing.name))].sort();

            if (uniqueIngredientNames.length > 0) {
                const insertQuery = `
                    INSERT INTO grocery_list_items (user_id, grocery_list_id, name)
                    SELECT $1, $2, unnest($3::text[]);
                `;
                await client.query(insertQuery, [userId, newListId, uniqueIngredientNames]);
            }
        }
        
        await client.query('COMMIT');

        const items = await getGroceryListItems(userId, newListId);
        return {
            id: newListId,
            name: listName,
            is_active: true,
            items: items
        };

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database transaction error in generateGroceryList:', err);
        throw new Error('Could not generate grocery list.');
    } finally {
        client.release();
    }
};

export const updateGroceryListItem = async (userId, itemId, checked) => {
    const client = await pool.connect();
    try {
        const query = `
            UPDATE grocery_list_items 
            SET checked = $1 
            WHERE id = $2 AND user_id = $3
            RETURNING id, name, checked;
        `;
        const res = await client.query(query, [checked, itemId, userId]);
        if (res.rows.length === 0) {
            throw new Error("Grocery item not found or user unauthorized.");
        }
        return res.rows[0];
    } catch (err) {
        console.error('Database error in updateGroceryListItem:', err);
        throw new Error('Could not update grocery list item.');
    } finally {
        client.release();
    }
};

export const addGroceryListItem = async (userId, listId, name) => {
    const client = await pool.connect();
    try {
        await ensureDatabaseSchema(client);

        const check = await client.query('SELECT id FROM grocery_lists WHERE id = $1 AND user_id = $2', [listId, userId]);
        if (check.rows.length === 0) throw new Error("List not found.");

        const query = `
            INSERT INTO grocery_list_items (user_id, grocery_list_id, name)
            VALUES ($1, $2, $3)
            RETURNING id, name, checked;
        `;
        const res = await client.query(query, [userId, listId, name]);
        return res.rows[0];
    } catch (err) {
        console.error('Database error in addGroceryListItem:', err);
        throw new Error('Could not add item.');
    } finally {
        client.release();
    }
};

export const removeGroceryListItem = async (userId, itemId) => {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM grocery_list_items WHERE id = $1 AND user_id = $2', [itemId, userId]);
    } catch (err) {
        console.error('Database error in removeGroceryListItem:', err);
        throw new Error('Could not remove item.');
    } finally {
        client.release();
    }
};

// --- Body Scans Persistence (New) ---

export const saveBodyScan = async (userId, scanData) => {
    const client = await pool.connect();
    try {
        // Ensure table exists on first run
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
        // Ensure table exists on first run
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