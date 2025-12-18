
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

export const handler = async (event) => {
    // --- 1. DEFINE PERMISSIVE CORS HEADERS ---
    const requestHeaders = event.headers || {};
    const origin = requestHeaders.origin || requestHeaders.Origin || "*";
    
    // These headers must be present on EVERY response
    const corsHeaders = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization, authorization, X-Api-Key, X-Requested-With, Accept, Origin",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
        "Content-Type": "application/json"
    };

    const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();

    // --- 2. IMMEDIATE PREFLIGHT HANDLER ---
    if (method === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: "" };
    }

    try {
        const {
            GEMINI_API_KEY,
            JWT_SECRET,
            FRONTEND_URL
        } = process.env;

        // --- 3. CONFIGURATION VALIDATION ---
        // We do this AFTER the OPTIONS check to ensure preflight always succeeds
        const requiredEnvVars = ['JWT_SECRET']; // Minimum required for basic routing
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            console.error(`[ScannerService] Missing critical env vars: ${missingVars.join(', ')}`);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ 
                    error: "Server Configuration Error", 
                    details: `Missing environment variables: ${missingVars.join(', ')}` 
                }),
            };
        }

        let path = event.rawPath || event.path || "/";
        
        // Normalize path
        if (!path.startsWith('/')) path = '/' + path;
        const pathParts = path.split('/').filter(Boolean);
        const resource = pathParts[0];

        // --- 4. AUTHENTICATION ---
        // Allow /ping without auth
        if (path === '/ping') {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ status: "ok" }) };
        }

        const authHeader = requestHeaders['authorization'] || requestHeaders['Authorization'];
        const token = authHeader?.split(' ')[1];

        if (!token) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized: No token provided.' })};
        }

        let decodedUser;
        try {
            decodedUser = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' })};
        }

        // --- 5. ROUTING ---
        const userId = decodedUser.userId;

        if (resource === 'init' || path === '/init') {
            // Re-using handleInitScan logic
            return await handleInitScan(event, corsHeaders, userId, decodedUser.email);
        }

        if (resource === 'body-scans' || path === '/body-scans') {
            if (method === 'GET') {
                const scans = await getBodyScans(userId);
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(scans) };
            }
            if (method === 'POST') {
                const scanData = JSON.parse(event.body || "{}");
                const newScan = await saveBodyScan(userId, scanData);
                return { statusCode: 201, headers: corsHeaders, body: JSON.stringify(newScan) };
            }
        }

        // Add login handler if needed for this specific function
        if (path === '/auth/customer-login') {
            return handleCustomerLogin(event, corsHeaders, JWT_SECRET);
        }

        // Handle other resources (Meal Logs, etc) if they are routed here
        if (resource === 'meal-log') return await handleMealLogRequest(event, corsHeaders, method, pathParts, userId);
        if (resource === 'saved-meals') return await handleSavedMealsRequest(event, corsHeaders, method, pathParts, userId);

        return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ error: `Not Found: ${path}` }),
        };

    } catch (error) {
        console.error(`[ScannerService] Internal Crash:`, error);
        return { 
            statusCode: 500, 
            headers: corsHeaders, 
            body: JSON.stringify({ error: 'Internal Server Error', message: error.message }) 
        };
    }
};

async function handleInitScan(event, headers, userId, userEmail) {
    const { PRISM_API_KEY, PRISM_ENV } = process.env;
    
    if (!PRISM_API_KEY) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing PRISM_API_KEY in environment" }) };
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch (e) {}

    const isSandbox = (PRISM_ENV || '').toLowerCase() === 'sandbox';
    const baseUrl = isSandbox ? "https://sandbox-api.hosted.prismlabs.tech" : "https://api.hosted.prismlabs.tech";
    const assetConfigId = "ee651a9e-6de1-4621-a5c9-5d31ca874718"; 
    const prismUserToken = `user_${userId}`;

    const prismHeaders = {
        'Authorization': `Bearer ${PRISM_API_KEY.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json;v=1'
    };

    try {
        // Create/Verify User
        await fetch(`${baseUrl}/users/${prismUserToken}`, { method: 'GET', headers: prismHeaders })
            .then(async res => {
                if (res.status === 404) {
                    await fetch(`${baseUrl}/users`, { 
                        method: 'POST', 
                        headers: prismHeaders, 
                        body: JSON.stringify({
                            token: prismUserToken,
                            email: userEmail || 'user@example.com',
                            weight: { value: 70, unit: 'kg' },
                            height: { value: 1.75, unit: 'm' },
                            sex: 'female',
                            birthDate: '1990-01-01',
                            researchConsent: true,
                            termsOfService: { accepted: true, version: "1" }
                        })
                    });
                }
            });

        // Create Session
        const scanRes = await fetch(`${baseUrl}/scans`, {
            method: 'POST',
            headers: prismHeaders,
            body: JSON.stringify({
                userToken: prismUserToken,
                assetConfigId: assetConfigId,
                deviceConfigName: body.deviceConfigName || 'ANDROID_SCANNER'
            })
        });

        const scanData = await scanRes.json();
        
        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                scanId: scanData.id || scanData._id,
                securityToken: scanData.securityToken,
                apiBaseUrl: baseUrl,
                assetConfigId: assetConfigId,
                mode: isSandbox ? 'sandbox' : 'production'
            })
        };
    } catch (e) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: "Prism API failure", details: e.message }) };
    }
}
