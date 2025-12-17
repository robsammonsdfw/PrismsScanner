import jwt from 'jsonwebtoken';
import { 
    saveBodyScan,
    getBodyScans
} from './services/databaseService.mjs';
import { Buffer } from 'buffer';

export const handler = async (event) => {
    // --- CORS HEADERS (Must be returned in every response) ---
    const headers = {
        "Access-Control-Allow-Origin": "*", // Or your specific frontend URL
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE",
        "Access-Control-Allow-Credentials": "true"
    };

    // Global Error Handler to prevent CORS errors on crash
    try {
        console.log("[ScannerService] Request:", JSON.stringify({ 
            path: event.rawPath || event.path, 
            method: event.requestContext?.http?.method || event.httpMethod 
        }));
        
        // --- 1. HANDLE PREFLIGHT (OPTIONS) ---
        const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
        if (method === 'OPTIONS') {
            return { statusCode: 204, headers, body: "" };
        }

        // --- 2. ENV VAR CHECK ---
        const {
            PRISM_API_KEY,
            PRISM_ENV,
            JWT_SECRET,
            PGHOST
        } = process.env;

        if (!PRISM_API_KEY) {
            console.error("Missing PRISM_API_KEY environment variable");
            return { statusCode: 500, headers, body: JSON.stringify({ error: "Server Configuration Error: Missing API Key" }) };
        }

        // --- 3. AUTHENTICATION ---
        // We extract the token case-insensitively
        const authHeader = (event.headers || {})['authorization'] || (event.headers || {})['Authorization'];
        let userId = 'anonymous';
        let userEmail = 'user@example.com';

        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                if (token && JWT_SECRET) {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    userId = decoded.userId;
                    userEmail = decoded.email || userEmail;
                }
            } catch (e) {
                console.warn("Token verification failed:", e.message);
                return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized: Invalid Token" }) };
            }
        } else {
            // If you require auth, uncomment this:
            // return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized: No Token" }) };
            console.log("No auth token provided, proceeding (check if this is desired behavior)");
        }

        // --- 4. ROUTING ---
        const path = event.rawPath || event.path || "/";
        
        // ROUTE: INIT SCAN (The Happy Path)
        // Matches /init, /default/init, etc.
        if (path.endsWith('/init')) {
            if (method !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
            return await handleInitScan(event, headers, userId, userEmail, PRISM_API_KEY, PRISM_ENV);
        }

        // ROUTE: GET HISTORY
        if (method === 'GET') {
            const scans = await getBodyScans(userId);
            return { statusCode: 200, headers, body: JSON.stringify(scans) };
        }

        // ROUTE: SAVE SCAN RESULT
        if (method === 'POST') {
            return await handleSaveScan(event, headers, userId, PRISM_API_KEY, PRISM_ENV);
        }

        return { statusCode: 404, headers, body: JSON.stringify({ error: `Not Found: ${path}` }) };

    } catch (criticalError) {
        console.error("[ScannerService] Critical Crash:", criticalError);
        // RETURN ERROR WITH HEADERS so frontend sees the message instead of CORS error
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "Internal Server Error", details: criticalError.message }) 
        };
    }
};

// --- LOGIC: HAPPY PATH IMPLEMENTATION ---
async function handleInitScan(event, headers, userId, userEmail, apiKey, envName) {
    console.log(`[Init] Starting initialization for user ${userId}`);

    // Parse Body
    let body = {};
    try {
        if (event.body) {
            body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
        }
    } catch (e) { 
        console.warn("Failed to parse body", e); 
    }

    const deviceConfigName = body.deviceConfigName || 'ANDROID_SCANNER';
    const isSandbox = (envName || '').toLowerCase() === 'sandbox';
    const baseUrl = isSandbox ? "https://sandbox-api.hosted.prismlabs.tech" : "https://api.hosted.prismlabs.tech";
    
    // Hardcoded Asset Config from your constants
    const assetConfigId = "ee651a9e-6de1-4621-a5c9-5d31ca874718"; 
    const prismUserToken = `user_${userId}`; // Unique stable ID for Prism

    const prismHeaders = {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json;v=1'
    };

    // HAPPY PATH STEP 1: Check if user exists
    let userExists = false;
    try {
        console.log(`[Init] Checking Prism user: ${prismUserToken}`);
        const checkRes = await fetch(`${baseUrl}/users/${prismUserToken}`, { method: 'GET', headers: prismHeaders });
        if (checkRes.ok) {
            userExists = true;
            console.log("[Init] User exists.");
        } else if (checkRes.status === 404) {
            console.log("[Init] User does not exist.");
        } else {
            const errText = await checkRes.text();
            console.error(`[Init] Error checking user: ${checkRes.status}`, errText);
            // We don't throw here, we try to create anyway just in case
        }
    } catch (e) {
        console.error("[Init] Network error checking user", e);
    }

    // HAPPY PATH STEP 2: Create user if needed
    if (!userExists) {
        try {
            console.log(`[Init] Creating Prism user...`);
            const createPayload = {
                token: prismUserToken,
                email: userEmail,
                // Default demographics required by Prism to init user
                weight: { value: 70, unit: 'kg' },
                height: { value: 1.75, unit: 'm' },
                sex: 'female', 
                birthDate: '1990-01-01',
                researchConsent: true,
                termsOfService: { accepted: true, version: "1" }
            };
            
            const createRes = await fetch(`${baseUrl}/users`, { 
                method: 'POST', 
                headers: prismHeaders, 
                body: JSON.stringify(createPayload) 
            });

            if (!createRes.ok) {
                const text = await createRes.text();
                // If it failed because user already exists (race condition), ignore. Otherwise error.
                if (createRes.status !== 409) {
                    console.error(`[Init] Failed to create user: ${text}`);
                    throw new Error(`Prism User Creation Failed: ${text}`);
                }
            }
        } catch (e) {
            console.error("[Init] Create user exception", e);
            throw e;
        }
    }

    // HAPPY PATH STEP 3: Create Scan Session
    console.log(`[Init] Creating scan session...`);
    const scanPayload = {
        userToken: prismUserToken,
        assetConfigId: assetConfigId,
        deviceConfigName: deviceConfigName
    };

    const scanRes = await fetch(`${baseUrl}/scans`, {
        method: 'POST',
        headers: prismHeaders,
        body: JSON.stringify(scanPayload)
    });

    if (!scanRes.ok) {
        const errText = await scanRes.text();
        console.error(`[Init] Scan creation failed: ${scanRes.status}`, errText);
        throw new Error(`Prism Scan Creation Failed: ${errText}`);
    }

    const scanData = await scanRes.json();
    console.log(`[Init] Scan created successfully: ${scanData.id}`);

    // HAPPY PATH STEP 4: Return details to frontend
    return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
            scanId: scanData.id || scanData._id,
            securityToken: scanData.securityToken, // Required by SDK
            apiBaseUrl: baseUrl,
            assetConfigId: assetConfigId,
            mode: isSandbox ? 'sandbox' : 'production'
        })
    };
}

async function handleSaveScan(event, headers, userId, apiKey, envName) {
    let body = {};
    try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
    } catch(e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
    }

    // Just save whatever the frontend sends + scanId
    console.log(`[Save] Saving scan data for ${body.scanId}`);
    
    // We can also fetch enriched data here if we want, but for now let's just save safely
    const saved = await saveBodyScan(userId, body);
    
    return {
        statusCode: 201,
        headers,
        body: JSON.stringify(saved)
    };
}