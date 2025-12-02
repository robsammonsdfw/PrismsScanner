// This service communicates with the same backend lambda used by the main Food App.
// We prioritize the environment variable, but keep the hardcoded URL as a fallback for local development if .env is missing.
const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'https://xmpbc16u1f.execute-api.us-west-1.amazonaws.com/default';
const AUTH_TOKEN_KEY = 'embracehealth-api-token';

const getHeaders = () => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

export const initScanSession = async () => {
    const response = await fetch(`${API_BASE_URL}/body-scans/init`, {
        method: 'POST',
        headers: getHeaders()
    });

    if (!response.ok) {
        throw new Error('Failed to initialize scan session via backend.');
    }

    return response.json();
};

export const saveBodyScan = async (data: any) => {
  const response = await fetch(`${API_BASE_URL}/body-scans`, {
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
  const response = await fetch(`${API_BASE_URL}/body-scans`, {
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