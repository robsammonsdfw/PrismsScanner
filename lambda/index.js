import { GoogleGenAI } from "@google/genai";
import jwt from 'jsonwebtoken';
import https from 'https';
import { 
    findOrCreateUserByEmail,
    getSavedMeals,
    saveMeal,
    deleteMeal,
    getMealPlans,
    createMealPlan,
    deleteMealPlan,
    addMealToPlanItem,
    removeMealFromPlanItem,
    createMealLogEntry,
    getMealLogEntries,
    addMealAndLinkToPlan,
    getGroceryLists,
    getGroceryListItems,
    createGroceryList,
    setActiveGroceryList,
    deleteGroceryList,
    generateGroceryList,
    updateGroceryListItem,
    addGroceryListItem,
    removeGroceryListItem,
    getRewardsSummary,
    getSavedMealById,
    getMealLogEntryById,
    saveBodyScan,
    getBodyScans
} from './services/databaseService.mjs';
import { Buffer } from 'buffer';

// --- MAIN HANDLER (ROUTER) ---
export const handler = async (event) => {
    // --- IMPORTANT: CONFIGURE THESE IN YOUR LAMBDA ENVIRONMENT VARIABLES ---
    const {
        GEMINI_API_KEY,
        SHOPIFY_STOREFRONT_TOKEN,
        SHOPIFY_STORE_DOMAIN,
        JWT_SECRET,
        FRONTEND_URL,
        PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT,
        // NEW ENV VARS FOR PRISM
        PRISM_API_KEY,
        PRISM_ENV, // 'sandbox' or 'production'
        PRISM_API_URL // Optional override
    } = process.env;
    
    // Dynamic CORS configuration
    const allowedOrigins = [
        "https://food.embracehealth.ai",
        "https://app.embracehealth.ai",
        "https://scan.embracehealth.ai",
        "https://main.dfp0msdoew280.amplifyapp.com",
        "http://localhost:5173",
        "http://localhost:3000",
        FRONTEND_URL
    ].filter(Boolean);

    const requestHeaders = event.headers || {};
    const origin = requestHeaders.origin || requestHeaders.Origin;
    
    let accessControlAllowOrigin = FRONTEND_URL || (allowedOrigins.length > 0 ? allowedOrigins[0] : '*');

    if (origin && allowedOrigins.includes(origin)) {
        accessControlAllowOrigin = origin;
    }

    const headers = {
        "Access-Control-Allow-Origin": accessControlAllowOrigin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,DELETE,PUT"
    };

    const requiredEnvVars = [
        'GEMINI_API_KEY', 'SHOPIFY_STOREFRONT_TOKEN', 'SHOPIFY_STORE_DOMAIN',
        'JWT_SECRET', 'FRONTEND_URL', 'PGHOST', 'PGUSER', 'PGPASSWORD',
        'PGDATABASE', 'PGPORT'
        // PRISM_API_KEY is validated inside the specific handler to allow partial app function if missing
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        const errorMessage = `Configuration error: The following required environment variables are missing: ${missingVars.join(', ')}.`;
        console.error(errorMessage);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: errorMessage }),
        };
    }

    let path;
    let method;

    if (event.requestContext && event.requestContext.http) {
        path = event.requestContext.http.path;
        method = event.requestContext.http.method;
    } else if (event.path) {
        path = event.path;
        method = event.httpMethod;
    } else {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error: Malformed request event.' }) };
    }
    
    const stage = event.requestContext?.stage;
    if (stage && stage !== '$default') {
        const stagePrefix = `/${stage}`;
        if (path.startsWith(stagePrefix)) {
            path = path.substring(stagePrefix.length);
        }
    }
    
    if (method === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    if (path === '/auth/customer-login') {
        return handleCustomerLogin(event, headers, JWT_SECRET);
    }
    
    const normalizedHeaders = {};
    if (event.headers) {
        for (const key in event.headers) {
            normalizedHeaders[key.toLowerCase()] = event.headers[key];
        }
    }

    const token = normalizedHeaders['authorization']?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized: No token provided.' })};
    }

    try {
        event.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' })};
    }

    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[0];

    try {
        // --- NEW RESOURCE FOR BODY SCANS ---
        if (resource === 'body-scans') {
            return await handleBodyScansRequest(event, headers, method, pathParts);
        }
        
        // --- EXISTING RESOURCES ---
        if (resource === 'meal-log') {
            return await handleMealLogRequest(event, headers, method, pathParts);
        }
        if (resource === 'saved-meals') {
            return await handleSavedMealsRequest(event, headers, method, pathParts);
        }
        if (resource === 'meal-plans') {
            return await handleMealPlansRequest(event, headers, method, pathParts);
        }
        if (resource === 'grocery-lists') { 
            return await handleGroceryListRequest(event, headers, method, pathParts);
        }
        if (resource === 'grocery-list') { 
             return await handleGroceryListRequest(event, headers, method, ['grocery-lists', ...pathParts.slice(1)]);
        }
        if (resource === 'analyze-image' || resource === 'analyze-image-recipes') {
            return await handleGeminiRequest(event, ai, headers);
        }
        if (resource === 'get-meal-suggestions') {
            return await handleMealSuggestionRequest(event, ai, headers);
        }
        if (resource === 'rewards') {
            return await handleRewardsRequest(event, headers, method);
        }
    } catch (error) {
        console.error(`[ROUTER CATCH] Unhandled error for ${method} ${path}:`, error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'An unexpected internal server error occurred.' }) };
    }

    return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `Not Found: The path "${path}" could not be handled.` }),
    };
};

// --- HANDLER FOR BODY SCANS ---
async function handleBodyScansRequest(event, headers, method, pathParts) {
    const userId = event.user.userId;
    console.log(`[BodyScans] Processing request: ${method} ${pathParts.join('/')}`);

    // POST /body-scans/init -> Initialize a new session with Prism (Server-to-Server to avoid CORS)
    if (method === 'POST' && pathParts[1] === 'init') {
        try {
            const { PRISM_API_KEY, PRISM_ENV, PRISM_API_URL } = process.env;
            if (!PRISM_API_KEY) {
                console.error("[BodyScans] CRITICAL ERROR: PRISM_API_KEY is missing in environment variables.");
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error: PRISM_API_KEY missing.' }) };
            }

            // Determine Environment and Base URL
            // Appending /v1 to ensure we hit the correct versioned endpoint as per analysis of 404 errors.
            const env = PRISM_ENV === 'production' ? 'production' : 'sandbox';
            const baseUrl = PRISM_API_URL || "https://api.hosted.prismlabs.tech/v1";

            // Mask key for logging safety
            const maskedKey = PRISM_API_KEY ? `${PRISM_API_KEY.substring(0, 4)}...${PRISM_API_KEY.substring(PRISM_API_KEY.length - 4)}` : 'MISSING';
            console.log(`[BodyScans] Init Config - Env: ${env}, Url: ${baseUrl}, Key: ${maskedKey}`);

            const assetConfigId = "ee651a9e-6de1-4621-a5c9-5d31ca874718";
            
            // Generate a unique token for the user.
            const prismUserToken = `user_${userId}`; 
            
            // 1. CHECK IF USER EXISTS
            // GET /users/{token}
            let userExists = false;
            try {
                console.log(`[BodyScans] Checking if user exists at: ${baseUrl}/users/${prismUserToken}`);
                const checkUserRes = await fetch(`${baseUrl}/users/${prismUserToken}`, {
                    method: 'GET',
                    headers: { 'x-api-key': PRISM_API_KEY }
                });

                if (checkUserRes.ok) {
                    userExists = true;
                    console.log(`[BodyScans] User ${prismUserToken} already exists.`);
                } else if (checkUserRes.status !== 404) {
                    const checkErr = await checkUserRes.text();
                    console.warn(`[BodyScans] Check user warning (${checkUserRes.status}): ${checkErr}`);
                    
                    if (checkUserRes.status === 401 || checkUserRes.status === 403) {
                         throw new Error(`Authorization Failed during User Check: The PRISM_API_KEY appears invalid for the target URL (${baseUrl}).`);
                    }
                }
            } catch (checkErr) {
                 // Propagate auth errors specifically
                 if (checkErr.message && checkErr.message.includes("Authorization Failed")) {
                     throw checkErr;
                 }
                 console.warn(`[BodyScans] Failed to check user existence:`, checkErr);
            }

            // 2. REGISTER NEW USER IF NOT EXISTS
            // POST /users
            if (!userExists) {
                console.log(`[BodyScans] Registering new user at: ${baseUrl}/users`);
                
                // Use a COMPLETE payload structure satisfying the strict schema
                // Using safe defaults as we are in the pre-scan onboarding phase
                const userPayload = {
                    token: prismUserToken,
                    email: event.user.email || "user@example.com", 
                    
                    // Demographic placehodlers (Required by Schema)
                    weight: { value: 70, unit: 'kg' }, 
                    height: { value: 1.7, unit: 'm' }, 
                    sex: 'undefined', // Valid enum value per docs
                    region: 'north_america',
                    usaResidence: 'California',
                    birthDate: '1990-01-01',
                    
                    // Consent
                    researchConsent: false,
                    termsOfService: {
                        accepted: true,
                        version: "1"
                    }
                };

                const createUserRes = await fetch(`${baseUrl}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': PRISM_API_KEY },
                    body: JSON.stringify(userPayload) 
                });

                if (!createUserRes.ok) {
                    // If 409 Conflict, it means user was created in a race condition, which is fine to proceed.
                    if (createUserRes.status !== 409) {
                        const createErr = await createUserRes.text();
                        console.error(`[BodyScans] Create User Error: ${createErr}`);
                        
                        if (createUserRes.status === 401 || createUserRes.status === 403) {
                             throw new Error(`Authorization Failed during User Registration: The PRISM_API_KEY appears invalid for the target URL (${baseUrl}).`);
                        }
                        
                        throw new Error(`Prism User Registration Failed: ${createErr}`);
                    }
                }
            }

            // 3. CREATE SCAN
            // POST /scans
            console.log(`[BodyScans] Creating scan at: ${baseUrl}/scans`);
            const scanRes = await fetch(`${baseUrl}/scans`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': PRISM_API_KEY },
                body: JSON.stringify({ 
                    userToken: prismUserToken, 
                    assetConfigId: assetConfigId 
                })
            });

            if (!scanRes.ok) {
                const errorText = await scanRes.text();
                console.error(`[BodyScans] Prism Create Scan Error (${scanRes.status}): ${errorText}`);
                
                if (scanRes.status === 401 || scanRes.status === 403) {
                     throw new Error(`Authorization Failed during Scan Creation: The PRISM_API_KEY appears invalid for the target URL (${baseUrl}).`);
                }
                
                throw new Error(`Prism Scan Creation Failed: ${errorText}`);
            }
            const scanData = await scanRes.json();

            // Return credentials to frontend
            return {
                statusCode: 201,
                headers,
                body: JSON.stringify({
                    scanId: scanData.id || scanData._id,
                    securityToken: scanData.securityToken,
                    apiBaseUrl: baseUrl,
                    assetConfigId: assetConfigId,
                    mode: env // Return the mode so frontend uses correct visual indicators
                })
            };

        } catch (e) {
            console.error("Prism Initialization Error:", e);
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to initialize scan session with provider.', details: e.message }) };
        }
    }

    // GET /body-scans (Fetch history)
    if (method === 'GET') {
        const scans = await getBodyScans(userId);
        return { statusCode: 200, headers, body: JSON.stringify(scans) };
    }

    // POST /body-scans (Process & Save Completed Scan)
    if (method === 'POST') {
        const body = JSON.parse(event.body);
        
        if (body.scanId) {
            try {
                const { PRISM_API_KEY, PRISM_ENV, PRISM_API_URL } = process.env;
                
                // Determine base URL (same logic as init)
                const baseUrl = PRISM_API_URL || "https://api.hosted.prismlabs.tech/v1";

                const fetchPrism = async (endpoint) => {
                    const res = await fetch(`${baseUrl}${endpoint}`, {
                        headers: { 'x-api-key': PRISM_API_KEY }
                    });
                    if (res.status === 404) return null; // Not ready or not found
                    if (!res.ok) throw new Error(`Prism API ${endpoint} Failed: ${res.status}`);
                    return res.json();
                };

                // 1. Get Basic Scan Status/Details
                const scanDetails = await fetchPrism(`/scans/${body.scanId}`);
                
                // 2. Get Measurements
                const measurements = await fetchPrism(`/scans/${body.scanId}/measurements`);
                
                // 3. Get Mass/Body Fat
                const mass = await fetchPrism(`/scans/${body.scanId}/mass`);

                // Combine all data
                const enrichedScanData = {
                    ...scanDetails,
                    measurements: measurements || {},
                    composition: mass || {}, 
                    userGoal: body.userGoal,
                    status: scanDetails?.status || 'completed'
                };

                // 4. Save to Database
                const newScan = await saveBodyScan(userId, enrichedScanData);
                
                return { statusCode: 201, headers, body: JSON.stringify(newScan) };

            } catch (e) {
                console.error("Error fetching/saving Prism data:", e);
                // Fallback: Save what the frontend sent if server fetch fails
                const fallbackScan = await saveBodyScan(userId, { ...body, note: "Server fetch failed, raw data only" });
                return { statusCode: 201, headers, body: JSON.stringify(fallbackScan) };
            }
        } else {
             return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing scanId in request.' }) };
        }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
}

// --- EXISTING HANDLERS ---

async function handleGroceryListRequest(event, headers, method, pathParts) {
    const userId = event.user.userId;
    if (method === 'GET' && pathParts.length === 1) {
        const lists = await getGroceryLists(userId);
        return { statusCode: 200, headers, body: JSON.stringify(lists) };
    }
    if (method === 'POST' && pathParts.length === 1) {
        const { name } = JSON.parse(event.body);
        const newList = await createGroceryList(userId, name);
        return { statusCode: 201, headers, body: JSON.stringify(newList) };
    }
    if (method === 'POST' && pathParts.length === 2 && pathParts[1] === 'generate') {
        const { name, mealPlanIds } = JSON.parse(event.body);
        const newList = await generateGroceryList(userId, mealPlanIds, name);
        return { statusCode: 201, headers, body: JSON.stringify(newList) };
    }
    const subId = parseInt(pathParts[1], 10);
    if (method === 'GET' && pathParts.length === 3 && pathParts[2] === 'items' && subId) {
        const items = await getGroceryListItems(userId, subId);
        return { statusCode: 200, headers, body: JSON.stringify(items) };
    }
    if (method === 'POST' && pathParts.length === 3 && pathParts[2] === 'active' && subId) {
        await setActiveGroceryList(userId, subId);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }
    if (method === 'DELETE' && pathParts.length === 2 && subId) {
        await deleteGroceryList(userId, subId);
        return { statusCode: 204, headers, body: '' };
    }
    if (method === 'POST' && pathParts.length === 3 && pathParts[2] === 'items' && subId) {
        const { name } = JSON.parse(event.body);
        const item = await addGroceryListItem(userId, subId, name);
        return { statusCode: 201, headers, body: JSON.stringify(item) };
    }
    if (method === 'PUT' && pathParts.length === 3 && pathParts[1] === 'items') {
        const itemId = parseInt(pathParts[2], 10);
        const { checked } = JSON.parse(event.body);
        const item = await updateGroceryListItem(userId, itemId, checked);
        return { statusCode: 200, headers, body: JSON.stringify(item) };
    }
    if (method === 'DELETE' && pathParts.length === 3 && pathParts[1] === 'items') {
        const itemId = parseInt(pathParts[2], 10);
        await removeGroceryListItem(userId, itemId);
        return { statusCode: 204, headers, body: '' };
    }
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' })};
}

async function handleMealLogRequest(event, headers, method, pathParts) {
    const userId = event.user.userId;
    if (method === 'GET' && pathParts.length === 1) {
        const logEntries = await getMealLogEntries(userId);
        return { statusCode: 200, headers, body: JSON.stringify(logEntries) };
    }
    if (method === 'GET' && pathParts.length === 2) {
        const logId = parseInt(pathParts[1], 10);
        if (!logId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid log ID.' }) };
        const entry = await getMealLogEntryById(userId, logId);
        if (!entry) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Entry not found.' }) };
        return { statusCode: 200, headers, body: JSON.stringify(entry) };
    }
    if (method === 'POST') {
        const { mealData, imageBase64 } = JSON.parse(event.body);
        const base64Data = imageBase64.split(',')[1] || imageBase64;
        const newEntry = await createMealLogEntry(userId, mealData, base64Data);
        return { statusCode: 201, headers, body: JSON.stringify(newEntry) };
    }
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' })};
}

async function handleSavedMealsRequest(event, headers, method, pathParts) {
    const userId = event.user.userId;
    const mealId = pathParts.length > 1 ? parseInt(pathParts[1], 10) : null;
    if (method === 'GET' && !mealId) {
        const meals = await getSavedMeals(userId);
        return { statusCode: 200, headers, body: JSON.stringify(meals) };
    }
    if (method === 'GET' && mealId) {
        const meal = await getSavedMealById(userId, mealId);
        if (!meal) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Meal not found.' }) };
        return { statusCode: 200, headers, body: JSON.stringify(meal) };
    }
    if (method === 'POST') {
        const mealData = JSON.parse(event.body);
        const newMeal = await saveMeal(userId, mealData);
        return { statusCode: 201, headers, body: JSON.stringify(newMeal) };
    }
    if (method === 'DELETE' && mealId) {
         await deleteMeal(userId, mealId);
         return { statusCode: 204, headers, body: '' };
    }
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' })};
}

async function handleMealPlansRequest(event, headers, method, pathParts) {
    const userId = event.user.userId;
    if (method === 'GET' && pathParts.length === 1) {
        const plans = await getMealPlans(userId);
        return { statusCode: 200, headers, body: JSON.stringify(plans) };
    }
    if (method === 'POST' && pathParts.length === 1) {
        const { name } = JSON.parse(event.body);
        const newPlan = await createMealPlan(userId, name);
        return { statusCode: 201, headers, body: JSON.stringify(newPlan) };
    }
    if (method === 'DELETE' && pathParts.length === 2) {
        const planId = parseInt(pathParts[1], 10);
        await deleteMealPlan(userId, planId);
        return { statusCode: 204, headers, body: '' };
    }
    if (method === 'POST' && pathParts.length === 3 && pathParts[2] === 'items') {
        const planId = parseInt(pathParts[1], 10);
        const { savedMealId, mealData } = JSON.parse(event.body);
        if (savedMealId) {
            const newItem = await addMealToPlanItem(userId, planId, savedMealId);
            return { statusCode: 201, headers, body: JSON.stringify(newItem) };
        } else if (mealData) {
             const newItem = await addMealAndLinkToPlan(userId, mealData, planId);
             return { statusCode: 201, headers, body: JSON.stringify(newItem) };
        }
         return { statusCode: 400, headers, body: JSON.stringify({ error: 'Either savedMealId or mealData is required.' })};
    }
    if (method === 'DELETE' && pathParts.length === 3 && pathParts[1] === 'items') {
        const itemId = parseInt(pathParts[2], 10);
        await removeMealFromPlanItem(userId, itemId);
        return { statusCode: 204, headers, body: '' };
    }
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' })};
}

async function handleRewardsRequest(event, headers, method) {
    if (method === 'GET') {
        const summary = await getRewardsSummary(event.user.userId);
        return { statusCode: 200, headers, body: JSON.stringify(summary) };
    }
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' })};
}

async function handleCustomerLogin(event, headers, JWT_SECRET) {
    const mutation = `mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) { customerAccessTokenCreate(input: $input) { customerAccessToken { accessToken expiresAt } customerUserErrors { code field message } } }`;
    try {
        const { email, password } = JSON.parse(event.body);
        if (!email || !password) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email/password required.' }) };
        const variables = { input: { email, password } };
        const shopifyResponse = await callShopifyStorefrontAPI(mutation, variables);
        if (!shopifyResponse) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Login failed: Invalid response.' }) };
        const data = shopifyResponse['customerAccessTokenCreate'];
        if (!data || data.customerUserErrors.length > 0) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid credentials.', details: data?.customerUserErrors[0]?.message }) };
        const user = await findOrCreateUserByEmail(email);
        const sessionToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        return { statusCode: 200, headers, body: JSON.stringify({ token: sessionToken }) };
    } catch (error) {
        console.error('[CRITICAL] LOGIN_HANDLER_CRASH:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Login failed.', details: error.message }) };
    }
}

async function handleGeminiRequest(event, ai, headers) {
    const body = JSON.parse(event.body);
    const { base64Image, mimeType, prompt, schema } = body;
    const imagePart = { inlineData: { data: base64Image, mimeType } };
    const textPart = { text: prompt };
    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [imagePart, textPart] }, config: { responseMimeType: 'application/json', responseSchema: schema } });
    return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: response.text };
}

async function handleMealSuggestionRequest(event, ai, headers) {
    const body = JSON.parse(event.body);
    const { prompt, schema } = body;
    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: 'application/json', responseSchema: schema } });
    return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: response.text };
}

function callShopifyStorefrontAPI(query, variables) {
    const { SHOPIFY_STORE_DOMAIN, SHOPIFY_STOREFRONT_TOKEN } = process.env;
    const postData = JSON.stringify({ query, variables });
    const options = { hostname: SHOPIFY_STORE_DOMAIN, path: '/api/2024-04/graphql.json', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData), 'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN } };
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const responseBody = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) resolve(responseBody.data);
                    else reject(new Error(`Shopify API failed: ${res.statusCode}`));
                } catch (e) { reject(new Error(`Failed to parse response: ${e.message}`)); }
            });
        });
        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}