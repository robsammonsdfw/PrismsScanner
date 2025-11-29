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

export const PRISM_CONFIG_PLACEHOLDERS = {
  // Checks for env var, falls back to placeholder
  API_KEY: import.meta.env.VITE_PRISM_API_KEY || "y!V@T6o&5#mFpz13W!a3I6nZ",
  
  // Depending on your flow, you might need a pre-generated Token or Scan ID
  SCAN_ID: import.meta.env.VITE_PRISM_SCAN_ID || "YOUR_SCAN_ID_HERE", 
  
  TOKEN: import.meta.env.VITE_PRISM_TOKEN || "YOUR_ACCESS_TOKEN_HERE",
  
  // Environment setting (e.g., 'sandbox', 'production')
  ENVIRONMENT: import.meta.env.VITE_PRISM_ENV || "sandbox" 
};