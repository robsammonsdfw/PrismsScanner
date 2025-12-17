
import jwt from 'jsonwebtoken';
import { 
    saveBodyScan,
    getBodyScans
} from './services/databaseService.mjs';
import { Buffer } from 'buffer';

export const handler = async (event) => {
    // --- CORS CONFIGURATION (ROBUST IMPLEMENTATION) ---
    const requestHeaders = event.headers || {};
    // Extract origin case-insensitively
    const requestOrigin = requestHeaders.origin || requestHeaders.Origin || "";
    
    // For CORS with Credentials: true, we must reflect the specific origin.
    // If no origin is provided (e.g., server-side call), we fallback to *
    const allowedOrigin = requestOrigin ? requestOrigin : "*";

    const headers = {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization, authorization, X-Api-Key, x-api-key, X-Requested-With, Accept, Origin",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
        "Content-Type": "application/json"
    };

    try {
        const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
        const path = event.rawPath || event.path || "/";
        
        console.log(`[ScannerService] ${method} ${path} from ${requestOrigin}`);

        // --- 1. IMMEDIATE PREFLIGHT HANDLER ---
        if (method === 'OPTIONS') {
            return { 
                statusCode: 204, 
                headers, 
                body: "" 
            };
        }

        // --- 2. CONFIGURATION VALIDATION ---
        const {
            PRISM_API_KEY,
            PRISM_ENV,
            JWT_SECRET
        } = process.env;

        if (!PRISM_API_KEY || !JWT_SECRET) {
            console.error("Missing critical environment variables (PRISM_API_KEY or JWT_SECRET)");
            return { 
                statusCode: 500, 
                headers, 
                body: JSON.stringify({ error: "Server Configuration Error: Missing Keys" }) 
            };
        }

        // --- 3. AUTHENTICATION ---
        const authHeader = requestHeaders['authorization'] || requestHeaders['Authorization'];
        let userId = 'anonymous';
        let userEmail = 'user@example.com';

        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                if (token) {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    userId = decoded.userId;
                    userEmail = decoded.email || userEmail;
                }
            } catch (e) {
                console.warn("Token verification failed:", e.message);
                return { 
                    statusCode: 401, 
                    headers, 
                    body: JSON.stringify({ error: "Unauthorized: Invalid or Expired Token", details: e.message }) 
                };
            }
        } else if (!path.endsWith('/ping')) {
            // Require auth for everything except ping
            return { 
                statusCode: 401, 
                headers, 
                body: JSON.stringify({ error: "Unauthorized: No Authorization header provided" }) 
            };
        }

        // --- 4. ROUTING ---
        if (path.endsWith('/ping')) {
            return { 
                statusCode: 200, 
                headers, 
                body: JSON.stringify({ 
                    status: "ok", 
                    message: "Service Operational", 
                    userId,
                    timestamp: new Date().toISOString() 
                }) 
            };
        }

        if (path.endsWith('/init')) {
            if (method !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
            return await handleInitScan(event, headers, userId, userEmail, PRISM_API_KEY, PRISM_ENV);
        }

        if (path.endsWith('/history') || (path.endsWith('/body-scans') && method === 'GET')) {
            const scans = await getBodyScans(userId);
            return { statusCode: 200, headers, body: JSON.stringify(scans) };
        }

        if (method === 'POST') {
            return await handleSaveScan(event, headers, userId, PRISM_API_KEY, PRISM_ENV);
        }

        return { 
            statusCode: 404, 
            headers, 
            body: JSON.stringify({ error: `Not Found: ${path}` }) 
        };

    } catch (criticalError) {
        console.error("[ScannerService] Critical Crash:", criticalError);
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ 
                error: "Internal Server Error", 
                details: criticalError.message,
                stack: process.env.NODE_ENV === 'development' ? criticalError.stack : undefined
            }) 
        };
    }
};

async function handleInitScan(event, headers, userId, userEmail, apiKey, envName) {
    console.log(`[Init] Initializing for user: ${userId}`);

    let body = {};
    try {
        if (event.body) {
            body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
        }
    } catch (e) { 
        console.warn("Failed to parse request body as JSON");
    }

    const deviceConfigName = body.deviceConfigName || 'ANDROID_SCANNER';
    const isSandbox = (envName || '').toLowerCase() === 'sandbox';
    const baseUrl = isSandbox ? "https://sandbox-api.hosted.prismlabs.tech" : "https://api.hosted.prismlabs.tech";
    const assetConfigId = "ee651a9e-6de1-4621-a5c9-5d31ca874718"; 
    const prismUserToken = `user_${userId}`;

    const prismHeaders = {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json;v=1'
    };

    try {
        // Step 1: Ensure User Exists
        const checkRes = await fetch(`${baseUrl}/users/${prismUserToken}`, { method: 'GET', headers: prismHeaders });
        if (!checkRes.ok && checkRes.status === 404) {
            console.log("[Init] Creating new Prism user...");
            const createPayload = {
                token: prismUserToken,
                email: userEmail,
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
            if (!createRes.ok && createRes.status !== 409) {
                const errText = await createRes.text();
                throw new Error(`Prism User Creation Failed: ${errText}`);
            }
        }

        // Step 2: Create Scan Session
        console.log("[Init] Creating scan session...");
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
            throw new Error(`Prism Scan Creation Failed: ${errText}`);
        }

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
        console.error("[Init] Prism API Communication Error:", e);
        throw e;
    }
}

async function handleSaveScan(event, headers, userId) {
    try {
        const body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
        const saved = await saveBodyScan(userId, body);
        return {
            statusCode: 201,
            headers,
            body: JSON.stringify(saved)
        };
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Failed to save scan", details: e.message }) };
    }
}
