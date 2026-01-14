
import jwt from 'jsonwebtoken';
import https from 'https';
import { 
    findOrCreateUserByEmail,
    saveBodyScan,
    getBodyScans
} from './services/databaseService.mjs';
import { Buffer } from 'buffer';

// Use a persistent agent to keep connections alive
const agent = new https.Agent({
    keepAlive: true,
    timeout: 30000, 
    maxSockets: 100
});

// Helper for HTTPS requests
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
            console.error("Critical: JWT_SECRET environment variable is missing.");
            return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Configuration Error: Missing JWT_SECRET" }) };
        }

        const authHeader = requestHeaders['authorization'] || requestHeaders['Authorization'];
        const token = authHeader?.split(' ')[1];

        if (!token) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized: No token provided' })};
        }

        let decodedUser;
        try {
            decodedUser = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            console.error("Token verification failed:", err.message);
            return { 
                statusCode: 401, 
                headers: corsHeaders, 
                body: JSON.stringify({ 
                    error: 'Unauthorized: Invalid token', 
                    details: err.message, // Helps debug (e.g. "invalid signature", "jwt expired")
                    receivedToken: token.substring(0, 15) + "..." // Log partial token for debug
                })
            };
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
            console.error("[Prism] CRITICAL: No security token found in User or Scan response.", {
                userRes: userRes.data,
                scanRes: scanRes.data
            });
            return { 
                statusCode: 502, 
                headers, 
                body: JSON.stringify({ 
                    error: "No security token returned by Prism API", 
                    details: { scanResponse: scanRes.data }
                }) 
            };
        }

        console.log(`[Prism] Success. Scan ID: ${scanRes.data.id}, Token Source: ${scanRes.data.token ? 'Scan' : 'User'}`);

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
