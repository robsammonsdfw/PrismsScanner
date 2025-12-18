
import jwt from 'jsonwebtoken';
import https from 'https';
import { 
    findOrCreateUserByEmail,
    saveBodyScan,
    getBodyScans
} from './services/databaseService.mjs';
import { Buffer } from 'buffer';

// Helper for HTTPS requests
async function prismRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
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

        req.on('error', (e) => reject(e));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Connection timed out'));
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
            'Accept': 'application/json', // Let Prism decide the best version
            'User-Agent': 'EmbraceHealth-Scanner/1.1'
        },
        timeout: 15000
    };

    try {
        console.log(`[Prism] Ensuring User state for ${prismUserToken}`);
        
        // Always attempt to create or update the user to ensure ToS is accepted.
        // Prism "POST /users" is often used as an idempotent "ensure" call.
        const userPayload = {
            token: prismUserToken,
            email: userEmail || 'user@example.com',
            weight: { value: 75, unit: 'kg' },
            height: { value: 1.8, unit: 'm' },
            sex: 'male',
            birthDate: '1990-01-01',
            researchConsent: true,
            termsOfService: { 
                accepted: true, 
                version: "2024-01-01", // Use a generic date string or "1"
                acceptedAt: new Date().toISOString()
            }
        };

        const userRes = await prismRequest({
            ...defaultRequestOptions,
            method: 'POST',
            path: '/users'
        }, userPayload);

        // If 409, user already exists. We should update them to be safe.
        if (userRes.status === 409 || userRes.ok) {
            console.log(`[Prism] User ${prismUserToken} verified/created. Updating ToS...`);
            await prismRequest({
                ...defaultRequestOptions,
                method: 'PUT',
                path: `/users/${prismUserToken}`
            }, userPayload);
        } else {
            console.error("[Prism] User setup failed:", userRes.data);
            return { statusCode: 502, headers, body: JSON.stringify({ error: "User setup failed", details: userRes.data }) };
        }

        // 2. Create Session
        console.log(`[Prism] Creating session for ${prismUserToken}`);
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

        console.log(`[Prism] Scan response keys: ${Object.keys(scanRes.data).join(', ')}`);

        if (!scanRes.ok) {
            return { statusCode: 502, headers, body: JSON.stringify({ error: "Prism Session creation failed", details: scanRes.data }) };
        }

        // Try all known token fields
        const securityToken = 
            scanRes.data.securityToken || 
            scanRes.data.token || 
            scanRes.data.clientToken || 
            scanRes.data.sessionToken;

        if (!securityToken) {
            console.error("[Prism] No token in response:", scanRes.data);
            return { 
                statusCode: 502, 
                headers, 
                body: JSON.stringify({ 
                    error: "No security token returned", 
                    message: "The Prism API created the scan but did not provide an access token. Ensure your account is active.",
                    details: scanRes.data 
                }) 
            };
        }

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                scanId: scanRes.data.id || scanRes.data._id,
                securityToken: securityToken,
                apiBaseUrl: baseUrl,
                assetConfigId: assetConfigId,
                mode: isSandbox ? 'sandbox' : 'production'
            })
        };

    } catch (e) {
        console.error("[Prism] Handshake error:", e);
        return { 
            statusCode: 502, 
            headers, 
            body: JSON.stringify({ error: "Connection to Prism Labs failed", message: e.message }) 
        };
    }
}
