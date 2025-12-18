
import React, { useEffect, useRef, useState } from 'react';
import '@prismlabs/web-scan-ui-kit';

import { PrismConfig, PrismLoadedEvent } from '../types';
import { initScanSession } from '../services/api';
import { Loader2, AlertTriangle, RefreshCcw, WifiOff, Camera } from 'lucide-react';

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
              <div className="text-center w-full max-w-sm">
                  <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="font-bold text-slate-100 mb-2 text-xl">Initialization Failed</p>
                  <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{errorMessage}</p>
              </div>
          );
      }
    }
  };

  const renderSDK = (prism: any, config: PrismConfig) => {
    if (initializedRef.current || !containerRef.current) return;
    
    console.log("[Scanner] Executing Prism.render with config:", {
        scanId: config.scanId,
        mode: config.mode,
        assetConfigId: config.assetConfigId
    });

    try {
        prism.render({
            ...config,
            container: containerRef.current
        });
        initializedRef.current = true;
        // Keep loading true for a moment while the SDK actually starts the camera
        setTimeout(() => setIsLoading(false), 1500);
    } catch (err: any) {
        console.error("[Scanner] Prism.render failed:", err);
        setError(`Render Error: ${err.message}`);
        setIsLoading(false);
    }
  };

  const waitForSDK = (scanId: string, securityToken: string, apiBaseUrl: string, assetConfigId: string, mode: string) => {
    setStatusMessage("Preparing camera view...");

    const config: PrismConfig = {
        apiKey: "token_based_auth", 
        scanId, 
        token: securityToken,
        mode, 
        apiBaseUrl,
        assetConfigId, // CRITICAL: This was missing in some previous logic
        translationOverrides: {
            leveling: { title: "Hold phone vertically" },
        },
        onSuccess: (data: any) => {
            console.log("[Scanner] Success Callback:", data);
            onComplete(data);
        },
        onFailure: (err: any) => {
            console.error('[Scanner] onFailure Callback:', err);
            setError(`Scanner failed: ${err.message || 'Permissions denied'}`);
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
    
    // Fallback if event is missed
    const checkInterval = setInterval(() => {
        const prism = (window as any).Prism;
        if (prism && !initializedRef.current) {
            renderSDK(prism, config);
            clearInterval(checkInterval);
        }
    }, 500);

    // Timeout after 10 seconds
    setTimeout(() => clearInterval(checkInterval), 10000);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    startSession();
    return () => { 
        document.body.style.overflow = '';
        window.removeEventListener('onPrismLoaded', () => {});
    };
  }, [retryCount]);

  const handleRetry = () => {
      initializedRef.current = false;
      setRetryCount(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col items-center justify-center font-sans overflow-hidden">
      {/* Container for Prism SDK */}
      <div 
        ref={containerRef} 
        id="prism-container"
        className="absolute inset-0 w-full h-full bg-black z-10" 
      />

      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[60] backdrop-blur-md">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full animate-pulse"></div>
            <Loader2 className="w-16 h-16 text-emerald-500 animate-spin relative z-10" />
          </div>
          
          <div className="text-center space-y-3 px-6 max-w-xs">
            <p className="text-emerald-400 font-bold tracking-widest uppercase text-xs animate-pulse">
                System Handshake
            </p>
            <p className="text-zinc-100 text-lg font-semibold">{statusMessage}</p>
            
            <div className="pt-8 flex flex-col items-center gap-2 opacity-60">
                <div className="p-3 bg-white/5 rounded-full">
                    <Camera className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">
                    Allow camera access when prompted
                </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[70] p-8 text-center overflow-y-auto">
          <div className="mb-10 w-full flex justify-center">{error}</div>
          <div className="flex flex-col gap-4 w-full max-w-xs shrink-0">
            {isAuthError ? (
              <button onClick={() => window.location.href = 'https://main.embracehealth.ai'} className="w-full py-4 bg-emerald-600 rounded-xl font-bold">Log In Again</button>
            ) : (
              <>
                <button onClick={handleRetry} className="w-full py-4 bg-emerald-600 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform">
                  <RefreshCcw className="w-5 h-5" /> Try Again
                </button>
                <button onClick={onClose} className="w-full py-4 bg-zinc-800 rounded-xl font-semibold opacity-60 hover:opacity-100">Return to Home</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
