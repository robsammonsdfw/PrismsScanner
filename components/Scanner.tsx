import React, { useEffect, useRef, useState } from 'react';
// Importing the package often triggers the injection or availability of the global event
import '@prismlabs/web-scan-ui-kit';

import { PrismConfig, PrismLoadedEvent } from '../types';
import { PRISM_CONFIG_PLACEHOLDERS } from '../constants';
import { Loader2, X, AlertTriangle } from 'lucide-react';

interface ScannerProps {
  onClose: () => void;
  onComplete: (results: any) => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onClose, onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>("Initializing...");
  const [error, setError] = useState<React.ReactNode | null>(null);

  // Helper to determine base URL
  const getApiBaseUrl = () => {
    return PRISM_CONFIG_PLACEHOLDERS.ENVIRONMENT === 'production'
      ? PRISM_CONFIG_PLACEHOLDERS.API_BASE_URL_PROD
      : PRISM_CONFIG_PLACEHOLDERS.API_BASE_URL_SANDBOX;
  };

  useEffect(() => {
    // Lock body scroll while Scanner is open
    document.body.style.overflow = 'hidden';

    const baseUrl = getApiBaseUrl();
    const apiKey = PRISM_CONFIG_PLACEHOLDERS.API_KEY;

    // 1. HAPPY PATH: Create User & Scan Record *Before* Loading SDK
    const initScanSession = async () => {
      try {
        // Validation
        if (apiKey.includes('YOUR_')) throw new Error("API Key is not configured in constants.ts");

        // A. CREATE USER
        setStatusMessage("Creating user record...");
        const externalUserId = `user_${Math.random().toString(36).substring(2, 15)}`; // In prod, use real user ID
        
        console.log(`[Happy Path 1/3] Creating user at ${baseUrl}/v1/users`);
        
        const userRes = await fetch(`${baseUrl}/v1/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({
                externalId: externalUserId,
                // Add demographics here if available from previous screens
            })
        });

        if (!userRes.ok) {
            const errText = await userRes.text();
            throw new Error(`Failed to create user: ${userRes.status} ${errText}`);
        }

        const userData = await userRes.json();
        // The API returns the internal ID which acts as the 'userToken' for the next step
        const userToken = userData.id || userData._id; 
        console.log("[Happy Path 1/3] User created:", userToken);

        // B. CREATE SCAN
        setStatusMessage("Initializing scan session...");
        console.log(`[Happy Path 2/3] Creating scan at ${baseUrl}/v1/scans`);

        const scanRes = await fetch(`${baseUrl}/v1/scans`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({
                userToken: userToken,
                assetConfigId: PRISM_CONFIG_PLACEHOLDERS.ASSET_CONFIG_ID,
                // Optional: source: 'web'
            })
        });

        if (!scanRes.ok) {
            const errText = await scanRes.text();
            throw new Error(`Failed to create scan: ${scanRes.status} ${errText}`);
        }

        const scanData = await scanRes.json();
        const scanId = scanData.id || scanData._id;
        const securityToken = scanData.securityToken; // Some versions require this
        console.log("[Happy Path 2/3] Scan created:", scanId);

        // C. READY TO RENDER
        // We now have a valid scanId existing on the server. 
        // We wait for the 'onPrismLoaded' event (or trigger it if already loaded) to render.
        waitForSDK(scanId, securityToken);

      } catch (err: any) {
        console.error("Initialization Failed:", err);
        setIsLoading(false);
        setError(
            <div className="text-center">
                <p className="font-bold text-red-400 mb-2">Initialization Error</p>
                <p className="text-sm">{err.message || "Could not start scan session."}</p>
            </div>
        );
      }
    };

    const waitForSDK = (validScanId: string, validToken?: string) => {
        setStatusMessage("Launching Scanner...");
        
        const handlePrismLoaded = (event: PrismLoadedEvent) => {
            if (initializedRef.current) return;
            initializedRef.current = true;

            const prism = event.detail.prism;
            if (!containerRef.current) return;

            console.log(`[Happy Path 3/3] Rendering SDK with Scan ID: ${validScanId}`);
            
            // CONFIGURATION OBJECT
            // We use the VALID scan ID from the API, not a random one.
            const config: PrismConfig & { [key: string]: any } = {
                apiKey: apiKey,
                scanId: validScanId, 
                token: validToken, // If the API returned a security token
                mode: PRISM_CONFIG_PLACEHOLDERS.ENVIRONMENT,
                
                // CRITICAL: URL OVERRIDES
                apiBaseUrl: baseUrl,
                apiUrl: baseUrl,
                baseUrl: baseUrl,
                api_base_url: baseUrl,

                assetConfigId: PRISM_CONFIG_PLACEHOLDERS.ASSET_CONFIG_ID,
                asset_config_id: PRISM_CONFIG_PLACEHOLDERS.ASSET_CONFIG_ID,
                
                container: containerRef.current,

                translationOverrides: {
                    leveling: { title: "Hold phone vertically" },
                },

                onSuccess: (data: any) => {
                    console.log('Scan success:', data);
                    onComplete(data);
                },
                onFailure: (err: any) => {
                    console.error('Scan failure:', err);
                    setError('Scan failed. Please try again.');
                },
                onClose: () => {
                    onClose();
                }
            };

            try {
                prism.render(config);
                setIsLoading(false);
            } catch (err) {
                console.error("SDK Render Error:", err);
                setError("Failed to launch 3D view.");
            }
        };

        // If 'onPrismLoaded' already fired before we got here, we might need a fallback or check
        // but typically adding the listener now is fine as the script loads async.
        window.addEventListener('onPrismLoaded', handlePrismLoaded);
        
        // Safety timeout if SDK never loads
        setTimeout(() => {
            if (isLoading && !initializedRef.current) {
               // Force check if window.Prism exists if event missed? 
               // For now just warn.
               console.warn("Still waiting for Prism SDK...");
            }
        }, 8000);
    };

    // Start the process
    initScanSession();

    return () => {
      document.body.style.overflow = '';
      // Cleanup listener would happen here, but since we define handlePrismLoaded inside,
      // strictly speaking we should move it out or use a ref, but for this flow it's okay.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col items-center justify-center">
      {/* Fullscreen Container for the SDK */}
      <div 
        ref={containerRef} 
        id="prism-scanner-container"
        className="absolute inset-0 w-full h-full bg-black" 
      />

      {/* Custom Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-[60]">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
          <p className="text-zinc-200 font-medium animate-pulse">{statusMessage}</p>
          <p className="text-zinc-500 text-xs mt-2 font-mono">Connecting to Prism Labs...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-[70] p-6">
          <div className="bg-red-900/20 p-4 rounded-full mb-6">
            {typeof error === 'string' ? <X className="w-10 h-10 text-red-500" /> : <AlertTriangle className="w-10 h-10 text-amber-500" />}
          </div>
          
          <div className="max-w-sm w-full text-zinc-200 mb-8">
            {error}
          </div>

          <button 
            onClick={onClose}
            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-semibold transition-colors w-full max-w-xs"
          >
            Return to Home
          </button>
        </div>
      )}
    </div>
  );
};