
// This service communicates with the backend lambda for the Scanner application.
const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'https://xmpbc16u1f.execute-api.us-west-1.amazonaws.com/default';
const SCANNER_API_URL = import.meta.env.VITE_SCANNER_API_URL || API_BASE_URL;

const AUTH_TOKEN_KEY = 'embracehealth-api-token';

const getHeaders = () => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

const getCleanUrl = (base: string, endpoint: string) => {
    const cleanBase = base.replace(/\/+$/, "");
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanBase}${cleanEndpoint}`;
};

const handleAuthError = () => {
    console.warn("[API] Session expired or unauthorized.");
    localStorage.removeItem(AUTH_TOKEN_KEY);
};

export const initScanSession = async (deviceConfigName?: string) => {
    const endpoint = getCleanUrl(SCANNER_API_URL, "init"); 

    console.log(`[API] Starting request to: ${endpoint}`);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ 
                deviceConfigName: deviceConfigName || 'ANDROID_SCANNER',
                timestamp: new Date().toISOString()
            })
        });

        console.log(`[API] Response status: ${response.status} ${response.statusText}`);

        if (response.status === 401) {
            handleAuthError();
            // We throw a specific message so the UI can show the "Login" button
            throw new Error("Session expired");
        }

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error("[API] Error body:", errorBody);
            throw new Error(errorBody.error || errorBody.message || `Server Error (${response.status})`);
        }

        const data = await response.json();
        console.log("[API] Session data success:", {
            scanId: data.scanId,
            mode: data.mode,
            baseUrl: data.apiBaseUrl,
            hasToken: !!data.securityToken
        });
        return data;
    } catch (err: any) {
        console.error("[API] initScanSession FAILED:", err);
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            throw new Error('Connection failed. Please check if your browser is blocking the request (CORS/AdBlock).');
        }
        throw err;
    }
};

export const saveBodyScan = async (data: any) => {
  const endpoint = getCleanUrl(SCANNER_API_URL, "body-scans"); 

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  
  if (response.status === 401) {
      handleAuthError();
      throw new Error("Session expired");
  }

  if (!response.ok) throw new Error('Failed to save scan results');
  return response.json();
};

export const getScanHistory = async () => {
  const endpoint = getCleanUrl(SCANNER_API_URL, "body-scans"); 

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: getHeaders()
  });

  if (response.status === 401) {
      handleAuthError();
      throw new Error("Session expired");
  }

  if (!response.ok) throw new Error('Failed to fetch scan history');
  return response.json();
};

export const checkAuthToken = (): boolean => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return !!token && token.length > 10;
};

export const setAuthToken = (token: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
};
