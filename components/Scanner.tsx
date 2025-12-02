import React, { useEffect, useRef, useState } from 'react';
// Importing the package often triggers the injection or availability of the global event
import '@prismlabs/web-scan-ui-kit';

import { PrismConfig, PrismLoadedEvent } from '../types';
import { PRISM_CONFIG_PLACEHOLDERS, generateScanId } from '../constants';
import { Loader2, X, AlertTriangle } from 'lucide-react';

interface ScannerProps {
  onClose: () => void;
  onComplete: (results: any) => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onClose, onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    // Lock body scroll while Scanner is open to prevent background scrolling
    document.body.style.overflow = 'hidden';

    // 1. VALIDATION: Check for HTTPS (Required for Camera)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (window.location.protocol !== 'https:' && !isLocalhost) {
      setIsLoading(false);
      setError(
        <div className="text-center">
          <p className="font-bold text-red-400 mb-2">Camera Access Blocked</p>
          <p>The browser blocks camera access on insecure (HTTP) connections.</p>
          <p className="mt-2 text-sm text-zinc-400">Please deploy to AWS Amplify (HTTPS) or use localhost.</p>
        </div>
      );
      return () => { document.body.style.overflow = ''; };
    }

    // 2. VALIDATION: Check for Missing API Key
    if (PRISM_CONFIG_PLACEHOLDERS.API_KEY.includes('YOUR_')) {
      setIsLoading(false);
      setError(
        <div className="text-center">
          <p className="font-bold text-amber-400 mb-2">API Key Missing</p>
          <p className="text-sm mb-4">You have not set your Prism Labs API Key.</p>
          <div className="text-left bg-black/50 p-3 rounded text-xs font-mono text-zinc-300 space-y-2">
            <p>1. Open <span className="text-blue-400">constants.ts</span></p>
            <p>2. Replace <span className="text-orange-400">YOUR_PRISM_API_KEY_HERE</span> with your actual key.</p>
          </div>
        </div>
      );
      return () => { document.body.style.overflow = ''; };
    }

    const handlePrismLoaded = (event: PrismLoadedEvent) => {
      // Prevent double initialization (React Strict Mode or multiple events)
      if (initializedRef.current) return;
      initializedRef.current = true;

      console.log('Prism SDK Loaded');
      setIsLoading(false);

      const prism = event.detail.prism;

      if (!containerRef.current) {
        console.error('Scanner container not found');
        return;
      }

      // Generate a fresh ID for this specific render attempt to avoid collisions
      const scanId = generateScanId();

      // Helper to handle empty or placeholder tokens
      const tokenValue = (!PRISM_CONFIG_PLACEHOLDERS.TOKEN || PRISM_CONFIG_PLACEHOLDERS.TOKEN.includes('YOUR_')) 
        ? undefined 
        : PRISM_CONFIG_PLACEHOLDERS.TOKEN;

      // Determine correct API URL
      const isProduction = PRISM_CONFIG_PLACEHOLDERS.ENVIRONMENT === 'production';
      const endpointUrl = isProduction 
        ? PRISM_CONFIG_PLACEHOLDERS.API_BASE_URL_PROD 
        : PRISM_CONFIG_PLACEHOLDERS.API_BASE_URL_SANDBOX;

      // CONFIGURATION OBJECT
      const config: PrismConfig = {
        apiKey: PRISM_CONFIG_PLACEHOLDERS.API_KEY,
        scanId: scanId,
        token: tokenValue,
        mode: PRISM_CONFIG_PLACEHOLDERS.ENVIRONMENT,
        
        // Critical Fix: Pass the URL in multiple ways to ensure the SDK picks it up
        // and overrides any internal defaults (like Amplitude).
        apiBaseUrl: endpointUrl,
        apiUrl: endpointUrl,
        baseUrl: endpointUrl,
        
        assetConfigId: PRISM_CONFIG_PLACEHOLDERS.ASSET_CONFIG_ID,
        
        container: containerRef.current,

        // Translation Override Example
        translationOverrides: {
          leveling: {
            title: "Please hold your phone vertically",
          },
        },

        onSuccess: (data) => {
          console.log('Scan completed successfully', data);
          onComplete(data);
        },
        onFailure: (err) => {
          console.error('Scan failed', err);
          setError('The scanner failed to initialize. Please check console for details.');
        },
        onClose: () => {
          console.log('User closed scanner');
          onClose();
        }
      };

      try {
        console.log("Initializing Prism with Config:", {
           scanId,
           mode: PRISM_CONFIG_PLACEHOLDERS.ENVIRONMENT,
           endpointUrl: endpointUrl,
           assetConfigId: PRISM_CONFIG_PLACEHOLDERS.ASSET_CONFIG_ID
        });
        prism.render(config);
      } catch (err) {
        console.error("Failed to render Prism UI:", err);
        setError("An unexpected error occurred while launching the scanner.");
      }
    };

    // Listen for the library's ready event
    window.addEventListener('onPrismLoaded', handlePrismLoaded);

    // Timeout fallback
    const timeoutId = setTimeout(() => {
      if (isLoading && !error && !initializedRef.current) {
        console.warn("Waiting for Prism SDK...");
      }
    }, 5000);

    return () => {
      // Unlock body scroll when component unmounts
      document.body.style.overflow = '';
      window.removeEventListener('onPrismLoaded', handlePrismLoaded);
      clearTimeout(timeoutId);
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
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
          <p className="text-zinc-400 animate-pulse">Initializing 3D Scanner...</p>
          <p className="text-zinc-600 text-xs mt-2">Connecting to Prism Labs</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-[70] p-6">
          <div className="bg-red-900/20 p-4 rounded-full mb-6">
            {typeof error === 'string' ? <X className="w-10 h-10 text-red-500" /> : <AlertTriangle className="w-10 h-10 text-amber-500" />}
          </div>
          
          <div className="max-w-sm w-full text-zinc-200">
            {error}
          </div>

          <button 
            onClick={onClose}
            className="mt-8 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-semibold transition-colors w-full max-w-xs"
          >
            Return to Home
          </button>
        </div>
      )}
    </div>
  );
};