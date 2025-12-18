
import jwt from 'jsonwebtoken';
import https from 'https';
import { 
    findOrCreateUserByEmail,
    saveBodyScan,
    getBodyScans
} from './services/databaseService.mjs';
import { Buffer } from 'buffer';

export const handler = async (event) => {
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

    if (method === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: "" };
    }

    try {
        const { JWT_SECRET, PRISM_API_KEY } = process.env;

        let path = event.rawPath || event.path || "/";
        if (!path.startsWith('/')) path = '/' + path;

        if (path === '/ping') {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ status: "ok" }) };
        }

        if (!JWT_SECRET) {
            return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Missing JWT_SECRET" }) };
        }

        const authHeader = requestHeaders['authorization'] || requestHeaders['Authorization'];
        const token = authHeader?.split(' ')[1];

        if (!token) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized: No token' })};
        }

        let decodedUser;
        try {
            decodedUser = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized: Invalid token' })};
        }

        const userId = decodedUser.userId;

        if (path === '/init') {
            return await handleInitScan(event, corsHeaders, userId, decodedUser.email, PRISM_API_KEY);
        }

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

        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: `Not Found: ${path}` }) };

    } catch (error) {
        console.error(`[Handler Error]:`, error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal Error', message: error.message }) };
    }
};

async function handleInitScan(event, headers, userId, userEmail, apiKey) {
    if (!apiKey) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing PRISM_API_KEY env var" }) };
    }

    const prismEnv = process.env.PRISM_ENV || 'production';
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

        console.log(`[Prism] Initializing for user: ${prismUserToken} on ${baseUrl}`);

        // 1. Ensure User
        const userCheck = await fetch(`${baseUrl}/users/${prismUserToken}`, { method: 'GET', headers: prismHeaders });
        if (userCheck.status === 404) {
            console.log(`[Prism] Creating new user ${prismUserToken}`);
            await fetch(`${baseUrl}/users`, { 
                method: 'POST', 
                headers: prismHeaders, 
                body: JSON.stringify({
                    token: prismUserToken,
                    email: userEmail || 'user@example.com',
                    weight: { value: 75, unit: 'kg' },
                    height: { value: 1.8, unit: 'm' },
                    sex: 'male',
                    birthDate: '1990-01-01',
                    researchConsent: true,
                    termsOfService: { accepted: true, version: "1" }
                })
            });
        }

        // 2. Create Session
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
        console.log(`[Prism] Scan creation status: ${scanRes.status}`);

        if (!scanRes.ok) {
            console.error("[Prism] Error creating scan:", scanData);
            return { 
                statusCode: scanRes.status, 
                headers, 
                body: JSON.stringify({ error: "Prism API Error", details: scanData }) 
            };
        }

        // Extract token - Prism sometimes returns it as 'securityToken' or just 'token'
        const securityToken = scanData.securityToken || scanData.token;

        if (!securityToken) {
            console.error("[Prism] No security token returned in response:", scanData);
            return { 
                statusCode: 502, 
                headers, 
                body: JSON.stringify({ error: "Prism API returned no security token", details: scanData }) 
            };
        }

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                scanId: scanData.id || scanData._id,
                securityToken: securityToken,
                apiBaseUrl: baseUrl,
                assetConfigId: assetConfigId,
                mode: isSandbox ? 'sandbox' : 'production'
            })
        };
    } catch (e) {
        console.error("[Prism] Critical failure:", e);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal failure", message: e.message }) };
    }
}
