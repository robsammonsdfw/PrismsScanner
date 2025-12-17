

// This service communicates with the same backend lambda used by the main Food App.
// We prioritize the environment variable, but keep the hardcoded URL as a fallback for local development if .env is missing.
const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'https://xmpbc16u1f.execute-api.us-west-1.amazonaws.com/default';

// New: Dedicated scanner microservice URL. Falls back to main API for backwards compatibility if not set.
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
    // Ensure no double slashes and correct endpoint structure
    // If SCANNER_API_URL is "https://...lambda-url.../" strip trailing slash
    const baseUrl = SCANNER_API_URL.replace(/\/$/, ""); 
    const endpoint = `${baseUrl}/init`; 

    console.log(`[Client] Initializing Scan Session at URL: ${endpoint}`);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ deviceConfigName: deviceConfigName || 'ANDROID_SCANNER' })
        });

        if (!response.ok) {
            let errorMessage = `Server Error (${response.status})`;
            try {
                const errorBody = await response.json();
                console.error("[Client] Server Error Details:", errorBody);
                if (errorBody.error) {
                    errorMessage = errorBody.error;
                }
                if (errorBody.details) {
                    errorMessage += `: ${errorBody.details}`;
                }
            } catch (e) {
                // If JSON parse fails, it usually means 500/502 from AWS infrastructure or CORS block
                console.warn('[Client] Could not parse backend error response. Raw status:', response.status);
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log("[Client] Init Success:", data);
        return data;
    } catch (err: any) {
        console.error("[Client] API Call Failed:", err);
        // Pass through specific messages or default
        if (err.message && err.message.includes('Failed to fetch')) {
            throw new Error('Connection failed. Please check your internet or firewall. (CORS/Network)');
        }
        throw err;
    }
};

export const saveBodyScan = async (data: any) => {
  const baseUrl = SCANNER_API_URL.replace(/\/$/, ""); 
  const endpoint = `${baseUrl}`; // Root POST for saving

  console.log(`[Client] Saving scan to: ${endpoint}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error('Failed to save body scan data');
  }
  
  return response.json();
};

export const getScanHistory = async () => {
  const baseUrl = SCANNER_API_URL.replace(/\/$/, ""); 
  const endpoint = `${baseUrl}`; // Root GET for history

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
    return !!localStorage.getItem(AUTH_TOKEN_KEY);
};

export const setAuthToken = (token: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
};
