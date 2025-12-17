
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

export const initScanSession = async (deviceConfigName?: string) => {
    const baseUrl = SCANNER_API_URL.replace(/\/$/, ""); 
    const endpoint = `${baseUrl}/init`; 

    console.log(`[API] Initializing session at: ${endpoint}`);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ 
                deviceConfigName: deviceConfigName || 'ANDROID_SCANNER',
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            console.error(`[API] Server responded with status: ${response.status}`);
            let errorMessage = `Server Error (${response.status})`;
            try {
                const errorBody = await response.json();
                console.error("[API] Error payload:", errorBody);
                errorMessage = errorBody.error || errorBody.message || errorMessage;
                if (errorBody.details) errorMessage += `: ${errorBody.details}`;
            } catch (e) {
                console.warn('[API] Could not parse error response JSON');
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log("[API] Session initialized successfully:", data.scanId);
        return data;
    } catch (err: any) {
        console.error("[API] Fetch execution failed:", err);
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            throw new Error('Connection failed. This is usually a CORS error or the backend is offline.');
        }
        throw err;
    }
};

export const saveBodyScan = async (data: any) => {
  const baseUrl = SCANNER_API_URL.replace(/\/$/, ""); 
  const endpoint = baseUrl; 

  console.log(`[API] Saving scan data to: ${endpoint}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const errText = await response.text();
    console.error("[API] Save failed:", errText);
    throw new Error('Failed to save scan results');
  }
  
  return response.json();
};

export const getScanHistory = async () => {
  const baseUrl = SCANNER_API_URL.replace(/\/$/, ""); 
  const endpoint = baseUrl; 

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: getHeaders()
  });

  if (!response.ok) {
    throw new Error('Failed to fetch scan history');
  }
  
  return response.json();
};

export const checkAuthToken = (): boolean => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return !!token && token.length > 10; // Basic validity check
};

export const setAuthToken = (token: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
};
