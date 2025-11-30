// This service communicates with the same backend lambda used by the main Food App.
const API_BASE_URL = 'https://xmpbc16u1f.execute-api.us-west-1.amazonaws.com/default';
const AUTH_TOKEN_KEY = 'embracehealth-meals-auth-token';

const getHeaders = () => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
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