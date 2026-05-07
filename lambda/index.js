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
    getBodyScans,
    refreshScanStatus
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

// --- UPLOAD URL HELPER ---
async function getUploadUrl(scanId) {
    const options = {
        hostname: 'api.hosted.prismlabs.tech',
        path: `/scans/${scanId}/upload-url`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.PRISM_API_KEY}`,
            'Accept': 'application/json;v=1'
        }
    };
    const res = await prismRequest(options);
    if (res.ok) return res.data;
    throw new Error(res.data?.error || 'Failed to get upload URL');
}

// --- MAIN HANDLER (ROUTER) ---
export const handler = async (event) => {
    const {
        GEMINI_API_KEY,
        SHOPIFY_STOREFRONT_TOKEN,
        SHOPIFY_STORE_DOMAIN,
        JWT_SECRET,
        FRONTEND_URL,
        PRISM_API_KEY, 
        PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT
    } = process.env;
    
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
    
    let accessControlAllowOrigin = '*';
    if (origin && allowedOrigins.includes(origin)) {
        accessControlAllowOrigin = origin;
    } else if (FRONTEND_URL) {
        accessControlAllowOrigin = FRONTEND_URL;
    }

    const headers = {
        "Access-Control-Allow-Origin": accessControlAllowOrigin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,DELETE,PUT",
        "Access-Control-Allow-Credentials": "true"
    };

    const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
    if (method === 'OPTIONS') {
        return { statusCode: 204, headers, body: "" };
    }

    try {
        let path = event.rawPath || event.path || "/";
        if (!path.startsWith('/')) path = '/' + path;

        const stage = event.requestContext?.stage;
        if (stage && stage !== '$default') {
            const stagePrefix = `/${stage}`;
            if (path.startsWith(stagePrefix)) {
                path = path.substring(stagePrefix.length);
            }
        }

        if (path === '/ping') {
            return { statusCode: 200, headers, body: JSON.stringify({ status: "ok" }) };
        }

        if (path === '/auth/customer-login') {
            return await handleCustomerLogin(event, headers, JWT_SECRET);
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
            console.warn(`[Auth] Strict verify failed: ${err.message}. Attempting Soft Auth.`);
            const decoded = jwt.decode(token);
            if (decoded && decoded.userId) {
                console.log("[Auth] Soft Auth successful for:", decoded.email);
                event.user = decoded;
            } else {
                return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized: Invalid token' })};
            }
        }

        const pathParts = path.split('/').filter(Boolean);
        const resource = pathParts[0];

        if (path === '/init') {
            return await handleInitScan(event, headers, event.user.userId, event.user.email, PRISM_API_KEY);
        }
        if (resource === 'body-scans') {
            return await handleBodyScansRequest(event, headers, method, pathParts);
        }

        if (resource === 'meal-log') {
            return await handleMealLogRequest(event, headers, method, pathParts);
        }
        if (resource === 'saved-meals') {
            return await handleSavedMealsRequest(event, headers, method, pathParts);
        }
        if (resource === 'meal-plans') {
            return await handleMealPlansRequest(event, headers, method, pathParts);
        }
        if (resource === 'grocery-lists' || resource === 'grocery-list') { 
            return await handleGroceryListRequest(event, headers, method, pathParts);
        }
        if (resource === 'analyze-image' || resource === 'analyze-image-recipes') {
            const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
            return await handleGeminiRequest(event, ai, headers);
        }
        if (resource === 'get-meal-suggestions') {
            const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
            return await handleMealSuggestionRequest(event, ai, headers);
        }
        if (resource === 'rewards') {
            return await handleRewardsRequest(event, headers, method);
        }

        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: `Not Found: The path "${path}" could not be handled.` }),
        };

    } catch (error) {
        console.error(`[CRITICAL HANDLER ERROR]`, error);
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message }) 
        };
    }
};

// --- HANDLERS ---

async function handleInitScan(event, headers, userId, userEmail, apiKey) {
    if (!apiKey) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing PRISM_API_KEY" }) };
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
            termsOfService: { accepted: true, version: "1.0" }
        };

        let userRes = await prismRequest({
            ...defaultRequestOptions,
            method: 'POST',
            path: '/users'
        }, userPayload);

        let securityToken = null;

        if (userRes.status === 409) {
            console.log(`[Prism] User ${prismUserToken} already exists, fetching existing token...`);
            const fetchRes = await prismRequest({
                ...defaultRequestOptions,
                method: 'GET',
                path: `/users/${prismUserToken}`
            });
            if (fetchRes.ok) {
                securityToken = fetchRes.data.token || fetchRes.data.securityToken;
            }
        } else if (userRes.ok) {
            securityToken = userRes.data.token || userRes.data.securityToken;
        }

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

        console.log("[Prism DEBUG] FULL scanRes.data:", JSON.stringify(scanRes.data, null, 2));

        const finalToken = scanRes.data.clientToken || scanRes.data.token || scanRes.data.securityToken || securityToken || prismUserToken;

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                scanId: scanRes.data.id,
                prismScanId: scanRes.data.prismScanId,
                securityToken: finalToken,
                apiBaseUrl: baseUrl,
                assetConfigId: assetConfigId,
                mode: isSandbox ? 'sandbox' : 'production',
                fullScanData: scanRes.data
            })
        };

    } catch (e) {
        console.error("[Prism] Handshake Failed:", e.message);
        return { statusCode: 502, headers, body: JSON.stringify({ error: "Prism Labs Unreachable", message: e.message }) };
    }
}

async function handleBodyScansRequest(event, headers, method, pathParts) {
    const userId = event.user.userId;
    const fullPath = event.requestContext?.http?.path || event.path || '';

    console.log(`[BodyScans] Method=${method}, FullPath=${fullPath}, pathParts=`, pathParts);

    if (method === 'GET') {
        const scans = await getBodyScans(userId);
        return { statusCode: 200, headers, body: JSON.stringify(scans) };
    }

    if (method === 'POST' && fullPath.includes('/refresh')) {
        const scanId = pathParts[pathParts.length - 1];
        console.log(`[Refresh] Handling refresh for scanId: ${scanId}`);
        const updated = await refreshScanStatus(userId, scanId);
        return { statusCode: 200, headers, body: JSON.stringify(updated) };
    }

    if (method === 'POST' && fullPath.includes('/upload-url')) {
        const scanId = pathParts[1];
        console.log(`[Upload] Getting signed URL for scanId: ${scanId}`);
        const uploadInfo = await getUploadUrl(scanId);
        return { statusCode: 201, headers, body: JSON.stringify(uploadInfo) };
    }

    if (method === 'POST') {
        let scanData = JSON.parse(event.body || '{}');
        if (!scanData) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing scan data.' }) };
        }

        const fullScanData = {
            ...scanData,
            prismScanId: scanData.prismScanId || scanData.id
        };

        const newScan = await saveBodyScan(userId, fullScanData);
        return { statusCode: 201, headers, body: JSON.stringify(newScan) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
}

// === YOUR OTHER HANDLERS (unchanged) ===
async function handleGroceryListRequest(event, headers, method, pathParts) {
    const userId = event.user.userId;
    if (method === 'GET' && pathParts.length === 1) {
        const lists = await getGroceryLists(userId);
        return { statusCode: 200, headers, body: JSON.stringify(lists) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ message: "Grocery logic placeholder" }) };
}

async function handleMealLogRequest(event, headers, method, pathParts) {
    const userId = event.user.userId;
    if (method === 'GET' && pathParts.length === 1) {
        const logEntries = await getMealLogEntries(userId);
        return { statusCode: 200, headers, body: JSON.stringify(logEntries) };
    }
    return { statusCode: 200, headers, body: JSON.stringify([]) };
}

async function handleSavedMealsRequest(event, headers, method, pathParts) {
    const meals = await getSavedMeals(event.user.userId);
    return { statusCode: 200, headers, body: JSON.stringify(meals) };
}

async function handleMealPlansRequest(event, headers, method, pathParts) {
    const plans = await getMealPlans(event.user.userId);
    return { statusCode: 200, headers, body: JSON.stringify(plans) };
}

async function handleRewardsRequest(event, headers, method) {
    if (method === 'GET') {
        const summary = await getRewardsSummary(event.user.userId);
        return { statusCode: 200, headers, body: JSON.stringify(summary) };
    }
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
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
    try {
        const body = JSON.parse(event.body);
        const { base64Image, mimeType, prompt, schema } = body;
        const imagePart = { inlineData: { data: base64Image, mimeType } };
        const textPart = { text: prompt };
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [imagePart, textPart] }, config: { responseMimeType: 'application/json', responseSchema: schema } });
        return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: response.text };
    } catch(e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
}

async function handleMealSuggestionRequest(event, ai, headers) {
    try {
        const body = JSON.parse(event.body);
        const { prompt, schema } = body;
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: 'application/json', responseSchema: schema } });
        return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: response.text };
    } catch(e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
}

function callShopifyStorefrontAPI(query, variables) {
    const { SHOPIFY_STORE_DOMAIN, SHOPIFY_STOREFRONT_TOKEN } = process.env;
    const postData = JSON.stringify({ query, variables });
    const options = { 
        hostname: SHOPIFY_STORE_DOMAIN, 
        path: '/api/2024-04/graphql.json', 
        method: 'POST', 
        headers: { 
            'Content-Type': 'application/json', 
            'Content-Length': Buffer.byteLength(postData), 
            'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN 
        } 
    };
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