
import jwt from 'jsonwebtoken';
import https from 'https';
import { 
    findOrCreateUserByEmail,
    saveBodyScan,
    getBodyScans
} from './services/databaseService.mjs';
import { Buffer } from 'buffer';

export const handler = async (event) => {
    // 1. DEFINE PERMISSIVE CORS HEADERS
    const requestHeaders = event.headers || {};
    const origin = requestHeaders.origin || requestHeaders.Origin || "*";
    
    const corsHeaders = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization, authorization, X-Api-Key, X-Requested-With, Accept, Origin",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
        "Content-Type": "application/json"
    };

    const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();

    // 2. IMMEDIATE PREFLIGHT HANDLER
    if (method === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: "" };
    }

    try {
        const {
            JWT_SECRET,
            PRISM_API_KEY
        } = process.env;

        // 3. ROUTING
        let path = event.rawPath || event.path || "/";
        if (!path.startsWith('/')) path = '/' + path;

        // Health Check
        if (path === '/ping') {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ status: "ok" }) };
        }

        // Validate Environment
        if (!JWT_SECRET) {
            console.error("[CRITICAL] Missing JWT_SECRET environment variable.");
            return { 
                statusCode: 500, 
                headers: corsHeaders, 
                body: JSON.stringify({ error: "Server Configuration Error: Missing Secret" }) 
            };
        }

        // 4. AUTHENTICATION
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

        const userId = decodedUser.userId;

        // 5. RESOURCE HANDLERS
        // Init Prism Session
        if (path === '/init') {
            return await handleInitScan(event, corsHeaders, userId, decodedUser.email, PRISM_API_KEY);
        }

        // Body Scan Persistence
        if (path === '/body-scans') {
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

        return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ error: `Route Not Found: ${path}` }),
        };

    } catch (error) {
        console.error(`[ScannerService] Handler Error:`, error);
        return { 
            statusCode: 500, 
            headers: corsHeaders, 
            body: JSON.stringify({ error: 'Internal Server Error', message: error.message }) 
        };
    }
};

async function handleInitScan(event, headers, userId, userEmail, apiKey) {
    if (!apiKey) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfigured: Missing PRISM_API_KEY" }) };
    }

    const prismEnv = process.env.PRISM_ENV || 'sandbox';
    const isSandbox = prismEnv.toLowerCase() === 'sandbox';
    const baseUrl = isSandbox ? "https://sandbox-api.hosted.prismlabs.tech" : "https://api.hosted.prismlabs.tech";
    const assetConfigId = "ee651a9e-6de1-4621-a5c9-5d31ca874718"; 
    const prismUserToken = `user_${userId}`;

    const prismHeaders = {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json;v=1'
    };

    try {
        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch (e) {}

        // Ensure user exists in Prism
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

        // Create the Session
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
        console.error("Prism API Integration failure:", e);
        return { 
            statusCode: 502, 
            headers, 
            body: JSON.stringify({ error: "Prism API failure", details: e.message }) 
        };
    }
}
