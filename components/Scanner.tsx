
import React, { useEffect, useRef, useState } from 'react';
import '@prismlabs/web-scan-ui-kit';

import { PrismConfig, PrismLoadedEvent } from '../types';
import { initScanSession } from '../services/api';
import { Loader2, X, AlertTriangle, LogOut, RefreshCcw } from 'lucide-react';

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
    setIsLoading(true);
    setError(null);
    setIsAuthError(false);
    setStatusMessage("Connecting to secure server...");

    try {
      const getDeviceConfig = (): string => {
        const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
        if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) return 'IPHONE_SCANNER';
        if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'IPHONE_SCANNER';
        return 'ANDROID_SCANNER';
      };

      const deviceConfigName = getDeviceConfig();
      console.log(`[Scanner] Initializing for ${deviceConfigName}`);
      
      const sessionData = await initScanSession(deviceConfigName);
      const { scanId, securityToken, apiBaseUrl, assetConfigId, mode } = sessionData;

      waitForSDK(scanId, securityToken, apiBaseUrl, assetConfigId, mode);
    } catch (err: any) {
      console.error("[Scanner] Initialization Error:", err);
      setIsLoading(false);
      
      const errorMessage = err.message || "";
      if (errorMessage.toLowerCase().includes('expired') || errorMessage.includes('401')) {
          setIsAuthError(true);
          setError("Your session has expired. Please log in again.");
      } else {
          setError(
              <div className="text-center">
                  <p className="font-bold text-red-400 mb-2 text-xl">Connection Error</p>
                  <p className="text-sm opacity-80 mb-4 max-w-xs mx-auto">
                    {errorMessage.includes('Failed to fetch') 
                      ? "Could not reach the scan server. Please check your network or try again." 
                      : errorMessage}
                  </p>
              </div>
          );
      }
    }
  };

  const waitForSDK = (scanId: string, token: string, apiBaseUrl: string, assetConfigId: string, mode: string) => {
    setStatusMessage("Launching Scanner UI...");
    
    const handlePrismLoaded = (event: PrismLoadedEvent) => {
        if (initializedRef.current) return;
        
        const prism = event.detail.prism;
        if (!containerRef.current) return;

        console.log(`[Scanner] Rendering SDK with Scan ID: ${scanId}`);
        initializedRef.current = true;

        const config: PrismConfig & { [key: string]: any } = {
            apiKey: "token_based_auth", 
            scanId, 
            token, 
            mode, 
            apiBaseUrl,
            apiUrl: apiBaseUrl,
            baseUrl: apiBaseUrl,
            assetConfigId,
            container: containerRef.current,
            translationOverrides: {
                leveling: { title: "Hold phone vertically" },
            },
            onSuccess: (data: any) => {
                console.log('[Scanner] Success:', data);
                onComplete(data);
            },
            onFailure: (err: any) => {
                console.error('[Scanner] SDK Error:', err);
                setError('Scanning process failed. Please restart.');
            },
            onClose: () => onClose()
        };

        try {
            prism.render(config);
            setIsLoading(false);
        } catch (err) {
            console.error("[Scanner] Render Error:", err);
            setError("Failed to initialize the 3D camera view.");
        }
    };

    window.addEventListener('onPrismLoaded', handlePrismLoaded);
    
    // Safety timeout: If SDK doesn't load within 12 seconds
    setTimeout(() => {
        if (!initializedRef.current && !error) {
            console.warn("[Scanner] SDK Load Timeout");
            setStatusMessage("Loading components... (this is taking longer than usual)");
        }
    }, 8000);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    startSession();
    return () => { document.body.style.overflow = ''; };
  }, [retryCount]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

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
          
          <div className="mb-10">
            {typeof error === 'string' ? <p className="text-xl font-bold mb-2">{error}</p> : error}
          </div>

          <div className="flex flex-col gap-4 w-full max-w-xs">
            {isAuthError ? (
              <button 
                  onClick={() => window.location.href = 'https://main.embracehealth.ai'} 
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold transition-all shadow-lg"
              >
                  Log In Again
              </button>
            ) : (
              <>
                <button 
                  onClick={handleRetry} 
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  <RefreshCcw className="w-5 h-5" />
                  Try Again
                </button>
                <button 
                  onClick={onClose} 
                  className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-semibold transition-all"
                >
                  Return to Home
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
