/**
 * PRISM LABS CONFIGURATION
 * 
 * NOTE: Sensitive keys (API KEY) have been moved to the Backend (Lambda)
 * to prevent CORS issues and security leaks.
 */

export const PRISM_CONFIG_PLACEHOLDERS = {
  // Asset ID is safe to be public as it just defines the "type" of scan
  ASSET_CONFIG_ID: "ee651a9e-6de1-4621-a5c9-5d31ca874718",
  
  // Environment setting (informational only, actual logic is on backend)
  ENVIRONMENT: import.meta.env.VITE_PRISM_ENV || "sandbox",
};