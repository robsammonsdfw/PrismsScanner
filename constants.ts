
/**
 * PRISM LABS CONFIGURATION
 * 
 * IMPORTANT: 
 * You must check your local `node_modules/@prismlabs/web-scan-ui-kit/documentation/` 
 * folder to find the exact parameter names required for your specific version of the SDK.
 * 
 * The keys below check for Environment Variables (Vite support) first.
 * If not found, they fall back to the hardcoded strings.
 * 
 * In AWS Amplify, you can set these in App Settings > Environment variables:
 * - VITE_PRISM_API_KEY
 * - VITE_PRISM_SCAN_ID
 * - VITE_PRISM_TOKEN
 */

// Helper to generate a random scan ID for testing purposes
export const generateScanId = () => {
  if (import.meta.env.VITE_PRISM_SCAN_ID) {
    return import.meta.env.VITE_PRISM_SCAN_ID;
  }
  return `test_scan_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
};

export const PRISM_CONFIG_PLACEHOLDERS = {
  // Checks for env var, falls back to placeholder
  API_KEY: import.meta.env.VITE_PRISM_API_KEY || "y!V@T6o&5#mFpz13W!a3I6nZ",
  
  // We auto-generate a random ID so you can test immediately.
  // In a real production app, your backend should generate this ID and pass it to the frontend.
  SCAN_ID: generateScanId(), 
  
  // Token is typically optional if you are using an API Key. We leave it empty by default.
  TOKEN: import.meta.env.VITE_PRISM_TOKEN || "",
  
  // Environment setting (e.g., 'sandbox', 'production')
  ENVIRONMENT: import.meta.env.VITE_PRISM_ENV || "sandbox",

  // Configuration for Asset ID
  ASSET_CONFIG_ID: "ee651a9e-6de1-4621-a5c9-5d31ca874718",

  // Valid API URLs
  API_BASE_URL_SANDBOX: "https://sandbox-api.hosted.prismlabs.tech",
  API_BASE_URL_PROD: "https://api.hosted.prismlabs.tech"
};