
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
    console.log("[Scanner] Starting Session Flow ---");
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
      
      console.log("[Scanner] Backend API response received:", sessionData);

      const { scanId, securityToken, apiBaseUrl, assetConfigId, mode } = sessionData;
      
      if (!scanId || !securityToken) {
          throw new Error("Invalid session data: Missing scanId or securityToken");
      }

      waitForSDK(scanId, securityToken, apiBaseUrl, assetConfigId, mode);
    } catch (err: any) {
      console.error("[Scanner] startSession failed:", err);
      setIsLoading(false);
      
      const errorMessage = err.message || "Connection failed";
      
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
                  {err.details && (
                      <div className="bg-black/40 p-3 rounded-lg text-[10px] text-left overflow-auto max-h-32 font-mono text-zinc-400">
                          {JSON.stringify(err.details, null, 2)}
                      </div>
                  )}
              </div>
          );
      }
    }
  };

  const renderSDK = (prism: any, config: PrismConfig) => {
    if (initializedRef.current) return;
    console.log("[Scanner] Executing prism.render(config)");
    
    try {
        prism.render(config);
        initializedRef.current = true;
        setIsLoading(false);
    } catch (err: any) {
        console.error("[Scanner] Prism.render failed:", err);
        setError(`Render Error: ${err.message}`);
        setIsLoading(false);
    }
  };

  const waitForSDK = (scanId: string, securityToken: string, apiBaseUrl: string, assetConfigId: string, mode: string) => {
    setStatusMessage("Preparing camera view...");

    const config: PrismConfig & { [key: string]: any } = {
        apiKey: "token_based_auth", 
        scanId, 
        token: securityToken,
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
            console.log('[Scanner] onSuccess:', data);
            onComplete(data);
        },
        onFailure: (err: any) => {
            console.error('[Scanner] onFailure:', err);
            setError(`Scanner failed: ${err.message || 'Permissions denied'}`);
        },
        onClose: () => onClose()
    };

    const existingPrism = (window as any).Prism;
    if (existingPrism) {
        console.log("[Scanner] Prism already on window, rendering...");
        renderSDK(existingPrism, config);
        return;
    }

    const handlePrismLoaded = (event: PrismLoadedEvent) => {
        console.log("[Scanner] Event onPrismLoaded received");
        const prism = event.detail.prism;
        renderSDK(prism, config);
    };

    window.addEventListener('onPrismLoaded', handlePrismLoaded);
    
    // Safety fallback
    setTimeout(() => {
        if (!initializedRef.current && !error) {
            const fallbackPrism = (window as any).Prism;
            if (fallbackPrism) {
                console.log("[Scanner] Fallback: Found Prism on window after delay");
                renderSDK(fallbackPrism, config);
            }
        }
    }, 2000);
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
          <p className="text-emerald-400 font-bold tracking-widest uppercase text-xs mb-2 animate-pulse">Connecting</p>
          <p className="text-zinc-400 text-sm font-medium">{statusMessage}</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[70] p-8 text-center overflow-y-auto">
          <div className="bg-red-500/10 p-6 rounded-full mb-8 shrink-0">
            {isAuthError ? <LogOut className="w-12 h-12 text-red-500" /> : <AlertTriangle className="w-12 h-12 text-amber-500" />}
          </div>
          <div className="mb-10 w-full">{error}</div>
          <div className="flex flex-col gap-4 w-full max-w-xs shrink-0">
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
