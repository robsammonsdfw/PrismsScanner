
import jwt from 'jsonwebtoken';
import https from 'https';
import { 
    findOrCreateUserByEmail,
    saveBodyScan,
    getBodyScans
} from './services/databaseService.mjs';
import { Buffer } from 'buffer';

// Helper for HTTPS requests since fetch is timing out in the Lambda environment
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
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json;v=1',
            'User-Agent': 'EmbraceHealth-Scanner/1.0'
        },
        timeout: 15000 // 15 second timeout
    };

    try {
        console.log(`[Prism] Checking user ${prismUserToken}`);
        
        // 1. Ensure User
        const userCheck = await prismRequest({
            ...defaultRequestOptions,
            path: `/users/${prismUserToken}`
        });

        if (userCheck.status === 404) {
            console.log(`[Prism] Creating user ${prismUserToken}`);
            const createRes = await prismRequest({
                ...defaultRequestOptions,
                method: 'POST',
                path: '/users'
            }, {
                token: prismUserToken,
                email: userEmail || 'user@example.com',
                weight: { value: 75, unit: 'kg' },
                height: { value: 1.8, unit: 'm' },
                sex: 'male',
                birthDate: '1990-01-01',
                researchConsent: true,
                termsOfService: { accepted: true, version: "1" }
            });
            
            if (!createRes.ok) {
                return { statusCode: 502, headers, body: JSON.stringify({ error: "Failed to create Prism user", details: createRes.data }) };
            }
        } else if (!userCheck.ok) {
            return { statusCode: 502, headers, body: JSON.stringify({ error: "Prism User check failed", details: userCheck.data }) };
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

        if (!scanRes.ok) {
            return { statusCode: 502, headers, body: JSON.stringify({ error: "Prism Session creation failed", details: scanRes.data }) };
        }

        const securityToken = scanRes.data.securityToken || scanRes.data.token;

        if (!securityToken) {
            return { statusCode: 502, headers, body: JSON.stringify({ error: "No security token returned", details: scanRes.data }) };
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
