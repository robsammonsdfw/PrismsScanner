import React, { useEffect, useRef, useState } from 'react';
import '@prismlabs/web-scan-ui-kit';

import { PrismConfig, PrismLoadedEvent } from '../types';
import { PRISM_CONFIG_PLACEHOLDERS } from '../constants';
import { initScanSession } from '../services/api';
import { Loader2, X, AlertTriangle, LogOut } from 'lucide-react';

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
  const [isAuthError, setIsAuthError] = useState<boolean>(false);

  useEffect(() => {
    // Lock body scroll while Scanner is open
    document.body.style.overflow = 'hidden';

    // 1. HAPPY PATH VIA BACKEND (Solves CORS)
    // We call our own API, which then talks to Prism server-to-server.
    const startSession = async () => {
      try {
        setStatusMessage("Connecting to secure server...");
        
        // This calls POST /body-scans/init on your backend
        // Your backend uses the hidden API Key to create the User & Scan
        const sessionData = await initScanSession();
        
        const { scanId, securityToken, apiBaseUrl, assetConfigId, mode } = sessionData;
        console.log("[Happy Path] Session Initialized via Backend:", scanId, "Mode:", mode);

        // 2. READY TO RENDER
        // We now have valid credentials from the backend.
        waitForSDK(scanId, securityToken, apiBaseUrl, assetConfigId, mode);

      } catch (err: any) {
        console.error("Initialization Failed:", err);
        setIsLoading(false);
        
        // Check for specific Auth errors (JWT Expired)
        const errorMessage = err.message || "";
        if (errorMessage.toLowerCase().includes('jwt expired') || errorMessage.toLowerCase().includes('unauthorized') || errorMessage.includes('401')) {
            setIsAuthError(true);
            setError("Your session has expired. Please log in again to continue.");
        } else {
            setError(
                <div className="text-center px-4">
                    <p className="font-bold text-red-400 mb-2 text-lg">Connection Error</p>
                    <p className="text-sm opacity-90 break-words">{errorMessage || "Could not start scan session."}</p>
                </div>
            );
        }
      }
    };

    const waitForSDK = (validScanId: string, validToken: string | undefined, apiBaseUrl: string, assetConfigId: string, mode: string) => {
        setStatusMessage("Launching Scanner...");
        
        const handlePrismLoaded = (event: PrismLoadedEvent) => {
            if (initializedRef.current) return;
            initializedRef.current = true;

            const prism = event.detail.prism;
            if (!containerRef.current) return;

            console.log(`[Happy Path] Rendering SDK with Scan ID: ${validScanId}`);
            
            // CONFIGURATION OBJECT
            const config: PrismConfig & { [key: string]: any } = {
                // We no longer need apiKey here if the scanId/token are pre-generated valid sessions
                apiKey: "ignored_by_sdk_if_scan_id_valid", 
                scanId: validScanId, 
                token: validToken, 
                mode: mode || 'sandbox', 
                
                // URL OVERRIDES (Backend tells us which URL it used)
                apiBaseUrl: apiBaseUrl,
                apiUrl: apiBaseUrl,
                baseUrl: apiBaseUrl,
                api_base_url: apiBaseUrl,

                assetConfigId: assetConfigId,
                asset_config_id: assetConfigId,
                
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

        window.addEventListener('onPrismLoaded', handlePrismLoaded);
        
        setTimeout(() => {
            if (isLoading && !initializedRef.current) {
               console.warn("Still waiting for Prism SDK...");
            }
        }, 8000);
    };

    startSession();

    return () => {
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoginRedirect = () => {
      // Clear the expired token
      localStorage.removeItem('embracehealth-api-token');
      // Redirect to main app login
      window.location.href = 'https://main.embracehealth.ai';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col items-center justify-center">
      <div 
        ref={containerRef} 
        id="prism-scanner-container"
        className="absolute inset-0 w-full h-full bg-black" 
      />

      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-[60]">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
          <p className="text-zinc-200 font-medium animate-pulse">{statusMessage}</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-[70] p-6">
          <div className="bg-red-900/20 p-4 rounded-full mb-6">
            {isAuthError ? (
                <LogOut className="w-10 h-10 text-red-500" />
            ) : (
                typeof error === 'string' ? <X className="w-10 h-10 text-red-500" /> : <AlertTriangle className="w-10 h-10 text-amber-500" />
            )}
          </div>
          
          <div className="max-w-sm w-full text-zinc-200 mb-8 text-center">
            {typeof error === 'string' ? <p className="text-lg font-medium">{error}</p> : error}
          </div>

          {isAuthError ? (
            <button 
                onClick={handleLoginRedirect} 
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold w-full max-w-xs transition-colors shadow-lg shadow-emerald-900/20"
            >
                Log In Again
            </button>
          ) : (
            <button onClick={onClose} className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-semibold w-full max-w-xs">
                Return to Home
            </button>
          )}
        </div>
      )}
    </div>
  );
};