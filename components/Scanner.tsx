
import React, { useEffect, useRef, useState } from 'react';
import '@prismlabs/web-scan-ui-kit';

import { PrismConfig, PrismLoadedEvent } from '../types';
import { initScanSession } from '../services/api';
import { Loader2, AlertTriangle, LogOut, RefreshCcw } from 'lucide-react';

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
  const [retryCount, setRetryCount] = useState<number>(0);

  const startSession = async () => {
    console.log("[Scanner] Starting Session...");
    setIsLoading(true);
    setError(null);
    setIsAuthError(false);
    setStatusMessage("Connecting to secure server...");

    try {
      const getDeviceConfig = (): string => {
        const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
        if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) return 'IPHONE_SCANNER';
        return 'ANDROID_SCANNER';
      };

      const deviceConfigName = getDeviceConfig();
      const sessionData = await initScanSession(deviceConfigName);
      
      console.log("[Scanner] Session initialized successfully:", sessionData);

      const { scanId, securityToken, apiBaseUrl, assetConfigId, mode } = sessionData;
      
      // Verification
      if (!scanId || !securityToken) {
          console.error("[Scanner] Data check failed:", { scanId: !!scanId, token: !!securityToken });
          throw new Error("Missing secure credentials from server.");
      }

      waitForSDK(scanId, securityToken, apiBaseUrl, assetConfigId, mode);
    } catch (err: any) {
      console.error("[Scanner] startSession error:", err);
      setIsLoading(false);
      
      const errorMessage = err.message || "Unknown error";
      if (errorMessage.toLowerCase().includes('expired') || errorMessage.includes('401')) {
          setIsAuthError(true);
          setError("Your session has expired. Please log in again.");
      } else {
          setError(
              <div className="text-center">
                  <p className="font-bold text-red-400 mb-2 text-xl">Initialization Failed</p>
                  <p className="text-sm opacity-80 mb-4 max-w-xs mx-auto">
                    {errorMessage}
                  </p>
              </div>
          );
      }
    }
  };

  const renderSDK = (prism: any, config: PrismConfig) => {
    if (initializedRef.current) return;
    console.log("[Scanner] Invoking prism.render...");
    
    try {
        prism.render(config);
        initializedRef.current = true;
        setIsLoading(false);
        console.log("[Scanner] Prism UI mounted.");
    } catch (err: any) {
        console.error("[Scanner] Rendering error:", err);
        setError(`Failed to mount scanner: ${err.message}`);
        setIsLoading(false);
    }
  };

  const waitForSDK = (scanId: string, securityToken: string, apiBaseUrl: string, assetConfigId: string, mode: string) => {
    setStatusMessage("Launching Scanner UI...");

    const config: PrismConfig & { [key: string]: any } = {
        apiKey: "token_based_auth", 
        scanId, 
        token: securityToken, // Map internal securityToken to the 'token' field the SDK expects
        mode, 
        apiBaseUrl,
        apiUrl: apiBaseUrl,
        baseUrl: apiBaseUrl,
        assetConfigId,
        container: containerRef.current as HTMLElement,
        translationOverrides: {
            leveling: { title: "Hold phone vertically" },
        },
        onSuccess: (data: any) => {
            console.log('[Scanner] Success:', data);
            onComplete(data);
        },
        onFailure: (err: any) => {
            console.error('[Scanner] SDK Error:', err);
            setError(`Scanner error: ${err.message || 'Check camera permissions'}`);
        },
        onClose: () => onClose()
    };

    const existingPrism = (window as any).Prism;
    if (existingPrism) {
        renderSDK(existingPrism, config);
        return;
    }

    const handlePrismLoaded = (event: PrismLoadedEvent) => {
        const prism = event.detail.prism;
        renderSDK(prism, config);
    };

    window.addEventListener('onPrismLoaded', handlePrismLoaded);
    
    // Safety check
    setTimeout(() => {
        if (!initializedRef.current && !error) {
            const fallbackPrism = (window as any).Prism;
            if (fallbackPrism) {
                renderSDK(fallbackPrism, config);
            }
        }
    }, 3000);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    startSession();
    return () => { document.body.style.overflow = ''; };
  }, [retryCount]);

  const handleRetry = () => setRetryCount(prev => prev + 1);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col items-center justify-center font-sans">
      <div ref={containerRef} className="absolute inset-0 w-full h-full bg-black" />

      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 z-[60] backdrop-blur-sm">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse"></div>
            <Loader2 className="w-14 h-14 text-emerald-500 animate-spin relative z-10" />
          </div>
          <p className="text-emerald-400 font-bold tracking-widest uppercase text-xs mb-2 animate-pulse">Initializing</p>
          <p className="text-zinc-400 text-sm font-medium">{statusMessage}</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[70] p-8 text-center">
          <div className="bg-red-500/10 p-6 rounded-full mb-8">
            {isAuthError ? <LogOut className="w-12 h-12 text-red-500" /> : <AlertTriangle className="w-12 h-12 text-amber-500" />}
          </div>
          <div className="mb-10">{error}</div>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            {isAuthError ? (
              <button onClick={() => window.location.href = 'https://main.embracehealth.ai'} className="w-full py-4 bg-emerald-600 rounded-xl font-bold">Log In Again</button>
            ) : (
              <>
                <button onClick={handleRetry} className="w-full py-4 bg-emerald-600 rounded-xl font-bold flex items-center justify-center gap-2">
                  <RefreshCcw className="w-5 h-5" /> Try Again
                </button>
                <button onClick={onClose} className="w-full py-4 bg-zinc-800 rounded-xl font-semibold">Return to Home</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
