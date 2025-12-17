import jwt from 'jsonwebtoken';
import { 
    saveBodyScan,
    getBodyScans
} from './services/databaseService.mjs';
import { Buffer } from 'buffer';

export const handler = async (event) => {
    console.log("[ScannerService] Request Received");
    
    // --- ENV CONFIGURATION ---
    const {
        PRISM_API_KEY,
        PRISM_ENV,
        PRISM_API_URL,
        JWT_SECRET,
        FRONTEND_URL,
        PGHOST
    } = process.env;

    // --- CORS CONFIGURATION ---
    // Allow specific origins or fallback to Frontend URL
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
    
    let accessControlAllowOrigin = FRONTEND_URL || (allowedOrigins.length > 0 ? allowedOrigins[0] : '*');
    if (origin && allowedOrigins.includes(origin)) {
        accessControlAllowOrigin = origin;
    }

    const headers = {
        "Access-Control-Allow-Origin": accessControlAllowOrigin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
    };

    // --- BASIC VALIDATION ---
    // We check for minimal requirements. 
    if (!JWT_SECRET || !PGHOST) {
        console.error("[ScannerService] Missing critical env vars (JWT_SECRET, PGHOST).");
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Server configuration error.' }),
        };
    }

    // --- REQUEST PARSING ---
    let path;
    let method;
    
    // Support Payload v2 (Function URL) and v1 (API Gateway REST)
    if (event.requestContext && event.requestContext.http) {
        path = event.requestContext.http.path;
        method = event.requestContext.http.method;
    } else if (event.path) {
        path = event.path;
        method = event.httpMethod;
    } else {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Malformed event.' }) };
    }
    
    // Handle OPTIONS for CORS preflight
    if (method === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    // --- AUTHENTICATION ---
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
        console.error(`[ScannerService] Auth Failed: ${err.message}`);
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' })};
    }

    const userId = event.user.userId;
    const pathParts = path.split('/').filter(Boolean);
    
    // Detect "init" action in path. Matches /init, /default/init, /prod/init etc.
    const isInit = pathParts.some(p => p === 'init');

    try {
        // --- ROUTE: INITIALIZE SCAN (POST .../init) ---
        if (method === 'POST' && isInit) {
            if (!PRISM_API_KEY) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server missing PRISM_API_KEY' }) };
            }
            return await handleInitScan(event, headers, userId);
        }

        // --- ROUTE: GET HISTORY (GET /) ---
        // Matches root path (empty pathParts) or just stage name
        if (method === 'GET') {
            const scans = await getBodyScans(userId);
            return { statusCode: 200, headers, body: JSON.stringify(scans) };
        }

        // --- ROUTE: SAVE SCAN RESULT (POST /) ---
        if (method === 'POST') {
            let body = {};
            if (event.body) {
                // Handle Base64 encoding if coming from API Gateway/Lambda Proxy
                const isBase64 = event.isBase64Encoded;
                const rawBody = isBase64 ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body;
                body = JSON.parse(rawBody);
            }
            
            if (!body.scanId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing scanId in body.' }) };
            }

            if (!PRISM_API_KEY) {
                 // Fallback if API key missing: just save what we have without fetching enrichment
                 console.warn("Missing PRISM_API_KEY, saving raw data only.");
                 const newScan = await saveBodyScan(userId, body);
                 return { statusCode: 201, headers, body: JSON.stringify(newScan) };
            }

            return await handleSaveScan(body, headers, userId);
        }

    } catch (error) {
        console.error(`[ScannerService] Error:`, error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: `Not Found: ${path}` }) };
};

// --- LOGIC HELPERS ---

async function handleInitScan(event, headers, userId) {
    const { PRISM_API_KEY, PRISM_ENV, PRISM_API_URL } = process.env;

    // Parse Body
    let requestBody = {};
    try {
        let bodyContent = event.body;
        if (event.isBase64Encoded) {
            bodyContent = Buffer.from(event.body, 'base64').toString('utf-8');
        }
        requestBody = typeof bodyContent === 'string' ? JSON.parse(bodyContent) : bodyContent;
    } catch (e) {
        // Ignore parse errors, fallback to defaults
    }

    let deviceConfigName = 'ANDROID_SCANNER';
    if (requestBody && requestBody.deviceConfigName === 'IPHONE_SCANNER') {
        deviceConfigName = 'IPHONE_SCANNER';
    }

    const finalApiKey = PRISM_API_KEY.trim();
    const isSandbox = (PRISM_ENV || '').trim().toLowerCase() === 'sandbox';
    const env = isSandbox ? 'sandbox' : 'production';
    
    let defaultUrl = "https://api.hosted.prismlabs.tech";
    if (isSandbox) defaultUrl = "https://sandbox-api.hosted.prismlabs.tech";
    
    const baseUrl = PRISM_API_URL || defaultUrl;
    // Standard Asset Config ID for body scanning
    const assetConfigId = "ee651a9e-6de1-4621-a5c9-5d31ca874718";
    const prismUserToken = `user_${userId}`;

    const prismHeaders = {
        'Authorization': `Bearer ${finalApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json;v=1'
    };

    // 1. Check if user exists in Prism
    let userExists = false;
    try {
        const checkUserRes = await fetch(`${baseUrl}/users/${prismUserToken}`, { method: 'GET', headers: prismHeaders });
        if (checkUserRes.ok) userExists = true;
    } catch (e) { console.warn("User check failed", e); }

    // 2. Register User if needed
    if (!userExists) {
        const userPayload = {
            token: prismUserToken,
            email: event.user.email || "user@example.com",
            weight: { value: 80, unit: 'kg' },
            height: { value: 1.8, unit: 'm' },
            sex: 'male',
            region: 'north_america',
            usaResidence: 'California',
            birthDate: '1990-01-01',
            researchConsent: true,
            termsOfService: { accepted: true, version: "1" }
        };
        await fetch(`${baseUrl}/users`, { method: 'POST', headers: prismHeaders, body: JSON.stringify(userPayload) });
    }

    // 3. Create Scan Session
    const scanRes = await fetch(`${baseUrl}/scans`, {
        method: 'POST',
        headers: prismHeaders,
        body: JSON.stringify({ userToken: prismUserToken, assetConfigId, deviceConfigName })
    });

    if (!scanRes.ok) {
        const errText = await scanRes.text();
        console.error("Prism Create Scan Failed:", errText);
        throw new Error(`Prism Scan Creation Failed: ${scanRes.status}`);
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
            mode: env
        })
    };
}

async function handleSaveScan(body, headers, userId) {
    const { PRISM_API_KEY, PRISM_ENV, PRISM_API_URL } = process.env;
    const isSandbox = (PRISM_ENV || '').trim().toLowerCase() === 'sandbox';
    let baseUrl = isSandbox ? "https://sandbox-api.hosted.prismlabs.tech" : "https://api.hosted.prismlabs.tech";
    if (PRISM_API_URL) baseUrl = PRISM_API_URL;

    try {
        const fetchPrism = async (endpoint) => {
            const res = await fetch(`${baseUrl}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${PRISM_API_KEY.trim()}`, 'Accept': 'application/json;v=1' }
            });
            if (res.status === 404) return null; 
            if (!res.ok) throw new Error(`Prism API ${endpoint} Failed: ${res.status}`);
            return res.json();
        };

        // Fetch detailed results from Prism to save in our DB
        const [scanDetails, measurements, mass] = await Promise.all([
            fetchPrism(`/scans/${body.scanId}`),
            fetchPrism(`/scans/${body.scanId}/measurements`),
            fetchPrism(`/scans/${body.scanId}/mass`)
        ]);

        const enrichedScanData = {
            ...scanDetails,
            measurements: measurements || {},
            composition: mass || {},
            userGoal: body.userGoal,
            status: scanDetails?.status || 'completed'
        };

        const newScan = await saveBodyScan(userId, enrichedScanData);
        return { statusCode: 201, headers, body: JSON.stringify(newScan) };

    } catch (e) {
        console.error("Fetch failed, saving raw fallback", e);
        const fallbackScan = await saveBodyScan(userId, { ...body, note: "Server fetch failed, saved raw data" });
        return { statusCode: 201, headers, body: JSON.stringify(fallbackScan) };
    }
}