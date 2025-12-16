
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
    // Note: If using separate lambda, the path might be just "/init" depending on API Gateway mapping
    // We assume the URL includes the stage but not the specific resource if it's a microservice root
    // For safety, we append /init to the base Scanner URL.
    
    // Check if the URL already ends in a slash to avoid double slash
    const baseUrl = SCANNER_API_URL.replace(/\/$/, ""); 
    const endpoint = `${baseUrl}/init`; 

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ deviceConfigName: deviceConfigName || 'ANDROID_SCANNER' })
    });

    if (!response.ok) {
        let errorMessage = 'Failed to initialize scan session via backend.';
        try {
            const errorBody = await response.json();
            if (errorBody.error) {
                errorMessage = errorBody.error;
            }
            if (errorBody.details) {
                errorMessage += `: ${errorBody.details}`;
            }
        } catch (e) {
            console.warn('Could not parse backend error response', e);
        }
        throw new Error(errorMessage);
    }

    return response.json();
};

export const saveBodyScan = async (data: any) => {
  const baseUrl = SCANNER_API_URL.replace(/\/$/, ""); 
  const endpoint = `${baseUrl}`; // Root POST for saving

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