
import jwt from 'jsonwebtoken';
import { 
    saveBodyScan,
    getBodyScans
} from './services/databaseService.mjs';
import { Buffer } from 'buffer';

export const handler = async (event) => {
    // --- CORS CONFIGURATION (MAXIMUM COMPATIBILITY) ---
    const requestHeaders = event.headers || {};
    const requestOrigin = requestHeaders.origin || requestHeaders.Origin || "*";
    
    // Define headers that are permissive for CORS
    const corsHeaders = {
        "Access-Control-Allow-Origin": requestOrigin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization, authorization, X-Api-Key, x-api-key, X-Requested-With, Accept, Origin",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
        "Content-Type": "application/json"
    };

    try {
        const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
        let path = event.rawPath || event.path || "/";
        
        // Normalize path (ensure it starts with / and remove trailing slash if not root)
        if (!path.startsWith('/')) path = '/' + path;
        if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

        console.log(`[ScannerService] ${method} ${path} from ${requestOrigin}`);

        // --- 1. IMMEDIATE PREFLIGHT HANDLER ---
        // We handle OPTIONS first to ensure the browser gets CORS clearance 
        // even if the rest of the function has configuration errors.
        if (method === 'OPTIONS') {
            return { 
                statusCode: 204, 
                headers: corsHeaders, 
                body: "" 
            };
        }

        // --- 2. CONFIGURATION VALIDATION ---
        const {
            PRISM_API_KEY,
            JWT_SECRET,
            PRISM_ENV
        } = process.env;

        const missing = [];
        if (!PRISM_API_KEY) missing.push("PRISM_API_KEY");
        if (!JWT_SECRET) missing.push("JWT_SECRET");

        if (missing.length > 0) {
            console.error(`[ScannerService] CRITICAL: Missing environment variables: ${missing.join(", ")}`);
            return { 
                statusCode: 500, 
                headers: corsHeaders, 
                body: JSON.stringify({ 
                    error: "Server Configuration Error", 
                    details: `Missing: ${missing.join(", ")}`,
                    hint: "Check Lambda Environment Variables in AWS Console"
                }) 
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
                console.warn("[ScannerService] Token verification failed:", e.message);
                return { 
                    statusCode: 401, 
                    headers: corsHeaders, 
                    body: JSON.stringify({ error: "Unauthorized: Invalid token", details: e.message }) 
                };
            }
        } else if (path !== '/ping') {
            return { 
                statusCode: 401, 
                headers: corsHeaders, 
                body: JSON.stringify({ error: "Unauthorized: No token provided" }) 
            };
        }

        // --- 4. ROUTING ---
        if (path === '/ping') {
            return { 
                statusCode: 200, 
                headers: corsHeaders, 
                body: JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }) 
            };
        }

        if (path === '/init') {
            if (method !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) };
            return await handleInitScan(event, corsHeaders, userId, userEmail, PRISM_API_KEY, PRISM_ENV);
        }

        if (path === '/history' || path === '/body-scans') {
            if (method === 'GET') {
                const scans = await getBodyScans(userId);
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(scans) };
            }
            if (method === 'POST') {
                return await handleSaveScan(event, corsHeaders, userId);
            }
        }

        return { 
            statusCode: 404, 
            headers: corsHeaders, 
            body: JSON.stringify({ error: `Not Found: ${path}` }) 
        };

    } catch (criticalError) {
        console.error("[ScannerService] Unexpected Crash:", criticalError);
        return { 
            statusCode: 500, 
            headers: corsHeaders, 
            body: JSON.stringify({ error: "Internal Server Error", message: criticalError.message }) 
        };
    }
};

async function handleInitScan(event, headers, userId, userEmail, apiKey, envName) {
    let body = {};
    try {
        if (event.body) {
            body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
        }
    } catch (e) { console.warn("Body parse failed"); }

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
        // Simple User Sync
        await fetch(`${baseUrl}/users/${prismUserToken}`, { method: 'GET', headers: prismHeaders })
            .then(async res => {
                if (res.status === 404) {
                    await fetch(`${baseUrl}/users`, { 
                        method: 'POST', 
                        headers: prismHeaders, 
                        body: JSON.stringify({
                            token: prismUserToken,
                            email: userEmail,
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

        if (!scanRes.ok) throw new Error(`Prism API Error: ${await scanRes.text()}`);
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
        console.error("Prism logic failed:", e);
        return { statusCode: 502, headers, body: JSON.stringify({ error: "Prism API failure", details: e.message }) };
    }
}

async function handleSaveScan(event, headers, userId) {
    try {
        const body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
        const saved = await saveBodyScan(userId, body);
        return { statusCode: 201, headers, body: JSON.stringify(saved) };
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Save failed" }) };
    }
}
