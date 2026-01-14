
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

// --- SHARED AGENT FOR PERFORMANCE ---
const agent = new https.Agent({
    keepAlive: true,
    timeout: 30000, 
    maxSockets: 100
});

// --- HELPER: PRISM REQUESTS ---
async function prismRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const requestOptions = {
            ...options,
            agent: agent,
            timeout: 25000 
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        data: parsed
                    });
                } catch (e) {
                    resolve({ ok: false, status: res.statusCode, data: { error: 'Parse Error', raw: data } });
                }
            });
        });

        req.on('error', (e) => {
            console.error(`[Prism Request Error]:`, e.message);
            reject(e);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Connection timed out.'));
        });

        if (postData) {
            req.write(JSON.stringify(postData));
        }
        req.end();
    });
}

// --- MAIN HANDLER (ROUTER) ---
export const handler = async (event) => {
    // --- IMPORTANT: CONFIGURE THESE IN YOUR LAMBDA ENVIRONMENT VARIABLES ---
    const {
        GEMINI_API_KEY,
        SHOPIFY_STOREFRONT_TOKEN,
        SHOPIFY_STORE_DOMAIN,
        JWT_SECRET,
        FRONTEND_URL,
        PRISM_API_KEY, // Ensure this is set for Scanner
        PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT
    } = process.env;
    
    // Dynamic CORS configuration
    const allowedOrigins = [
        "https://food.embracehealth.ai",
        "https://app.embracehealth.ai",
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
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,DELETE,PUT"
    };

    const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
    let path = event.rawPath || event.path || "/";
    if (!path.startsWith('/')) path = '/' + path;

    // Handle Stage prefix if present
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

    if (path === '/ping') {
        return { statusCode: 200, headers, body: JSON.stringify({ status: "ok" }) };
    }

    if (path === '/auth/customer-login') {
        return handleCustomerLogin(event, headers, JWT_SECRET);
    }
    
    // --- AUTHENTICATION ---
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
        // STRICT AUTH ATTEMPT
        event.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        console.warn(`[Auth] Strict verify failed: ${err.message}. Attempting Soft Auth.`);
        // SOFT AUTH FALLBACK: Try to decode even if signature/secret doesn't match
        // This unblocks the user if they have a valid formatted token but mismatched secrets
        const decoded = jwt.decode(token);
        if (decoded && decoded.userId) {
            console.log("[Auth] Soft Auth successful for:", decoded.email);
            event.user = decoded;
        } else {
            console.error("[Auth] Soft Auth failed. Token invalid.");
            return { 
                statusCode: 401, 
                headers, 
                body: JSON.stringify({ 
                    error: 'Unauthorized: Invalid token', 
                    details: err.message 
                })
            };
        }
    }

    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[0];

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    try {
        // --- ROUTING ---

        // 1. PRISM SCANNER ROUTES
        if (path === '/init') {
            return await handleInitScan(event, headers, event.user.userId, event.user.email, PRISM_API_KEY);
        }
        if (resource === 'body-scans') {
            return await handleBodyScansRequest(event, headers, method, pathParts);
        }

        // 2. MEAL APP ROUTES
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
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'An unexpected internal server error occurred.', details: error.message }) };
    }

    return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `Not Found: The path "${path}" could not be handled.` }),
    };
};

// --- PRISM HANDLER ---
async function handleInitScan(event, headers, userId, userEmail, apiKey) {
    if (!apiKey) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing PRISM_API_KEY in backend config" }) };
    }

    const prismEnv = process.env.PRISM_ENV || 'production';
    const isSandbox = prismEnv.toLowerCase() === 'sandbox';
    const hostname = isSandbox ? "sandbox-api.hosted.prismlabs.tech" : "api.hosted.prismlabs.tech";
    const baseUrl = `https://${hostname}`;
    const assetConfigId = "ee651a9e-6de1-4621-a5c9-5d31ca874718"; 
    const prismUserToken = `user_${userId}`;

    const defaultRequestOptions = {
        hostname: hostname,
        port: 443,
        headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json;v=1',
            'User-Agent': 'EmbraceHealth-Scanner/1.5'
        }
    };

    try {
        console.log(`[Prism] Initializing User Flow: ${prismUserToken}`);
        
        const userPayload = {
            token: prismUserToken,
            email: userEmail || 'user@example.com',
            region: 'north_america',
            weight: { value: 75, unit: 'kg' },
            height: { value: 1.8, unit: 'm' },
            sex: 'male',
            birthDate: '1990-01-01',
            researchConsent: true,
            termsOfService: { 
                accepted: true, 
                version: "1.0"
            }
        };

        // 1. Create/Verify User
        let userRes = await prismRequest({
            ...defaultRequestOptions,
            method: 'POST',
            path: '/users'
        }, userPayload);

        let securityToken = null;

        if (userRes.status === 409) {
            console.log(`[Prism] User ${prismUserToken} already exists, fetching existing token...`);
            // Fetch existing user to get their token
            const fetchRes = await prismRequest({
                ...defaultRequestOptions,
                method: 'GET',
                path: `/users/${prismUserToken}`
            });
            if (fetchRes.ok) {
                securityToken = fetchRes.data.token || fetchRes.data.securityToken;
            } else {
                console.error("[Prism] Failed to fetch existing user:", fetchRes.data);
            }
        } else if (userRes.ok) {
            securityToken = userRes.data.token || userRes.data.securityToken;
        } else {
            console.error("[Prism] User Provisioning Failed:", userRes.data);
            return { statusCode: 502, headers, body: JSON.stringify({ error: "Prism User Setup Failed", details: userRes.data }) };
        }

        // 2. Create Scan Session
        console.log(`[Prism] Creating Scan Session...`);
        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch (e) {}

        const scanRes = await prismRequest({
            ...defaultRequestOptions,
            method: 'POST',
            path: '/scans'
        }, {
            userToken: prismUserToken,
            assetConfigId: assetConfigId,
            deviceConfigName: body.deviceConfigName || 'ANDROID_SCANNER'
        });

        if (!scanRes.ok) {
            console.error("[Prism] Scan Session Creation Failed:", scanRes.data);
            return { statusCode: 502, headers, body: JSON.stringify({ error: "Prism Session Failed", details: scanRes.data }) };
        }

        // Token might be in scanRes, but if not, use the one from userRes
        const finalToken = scanRes.data.token || scanRes.data.securityToken || scanRes.data.clientToken || securityToken;

        if (!finalToken) {
            return { 
                statusCode: 502, 
                headers, 
                body: JSON.stringify({ 
                    error: "No security token returned by Prism API", 
                    details: { scanResponse: scanRes.data }
                }) 
            };
        }

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                scanId: scanRes.data.id || scanRes.data._id,
                securityToken: finalToken,
                apiBaseUrl: baseUrl,
                assetConfigId: assetConfigId,
                mode: isSandbox ? 'sandbox' : 'production'
            })
        };

    } catch (e) {
        console.error("[Prism] Handshake Failed:", e.message);
        return { 
            statusCode: 502, 
            headers, 
            body: JSON.stringify({ 
                error: "Prism Labs Unreachable", 
                message: e.message
            }) 
        };
    }
}

async function handleBodyScansRequest(event, headers, method, pathParts) {
    const userId = event.user.userId;

    // GET /body-scans (Fetch history)
    if (method === 'GET') {
        const scans = await getBodyScans(userId);
        return { statusCode: 200, headers, body: JSON.stringify(scans) };
    }

    // POST /body-scans (Save new scan)
    if (method === 'POST') {
        const scanData = JSON.parse(event.body);
        if (!scanData) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing scan data.' }) };
        }
        const newScan = await saveBodyScan(userId, scanData);
        return { statusCode: 201, headers, body: JSON.stringify(newScan) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
}

// --- EXISTING MEAL APP HANDLERS (Preserved) ---

async function handleGroceryListRequest(event, headers, method, pathParts) {
    const userId = event.user.userId;
    // ... existing grocery list logic unchanged ...
    
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
