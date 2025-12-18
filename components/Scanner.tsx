
import React, { useEffect, useRef, useState } from 'react';
// We try to import Prism directly as well as check the window object
import * as PrismModule from '@prismlabs/web-scan-ui-kit';

import { PrismConfig, PrismLoadedEvent } from '../types';
import { initScanSession } from '../services/api';
import { Loader2, AlertTriangle, RefreshCcw, Camera, Play } from 'lucide-react';

interface ScannerProps {
  onClose: () => void;
  onComplete: (results: any) => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onClose, onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isReadyToStart, setIsReadyToStart] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("Initializing...");
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  const startSession = async () => {
    console.log("[Scanner] Starting Session Flow ---");
    setIsLoading(true);
    setIsReadyToStart(false);
    setError(null);
    setStatusMessage("Connecting to secure server...");

    try {
      const getDeviceConfig = (): string => {
        const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
        if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) return 'IPHONE_SCANNER';
        return 'ANDROID_SCANNER';
      };

      const deviceConfigName = getDeviceConfig();
      const sessionData = await initScanSession(deviceConfigName);
      
      if (!sessionData.scanId || !sessionData.securityToken) {
          throw new Error("Invalid session data: Missing scanId or token");
      }

      setSessionInfo(sessionData);
      setIsReadyToStart(true);
      setIsLoading(false);
    } catch (err: any) {
      console.error("[Scanner] startSession failed:", err);
      setIsLoading(false);
      setError(
          <div className="text-center w-full max-w-sm px-6">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="font-bold text-slate-100 mb-2 text-xl">Initialization Failed</p>
              <p className="text-sm text-zinc-400 mb-6">{err.message || "Please check your internet connection."}</p>
          </div>
      );
    }
  };

  const handleStartScanner = () => {
    if (!sessionInfo) return;
    setIsLoading(true);
    setStatusMessage("Starting camera system...");
    
    // We proceed directly to Prism Render. 
    // Manual getUserMedia is removed as it can lock the hardware on some mobile browsers.
    waitForSDK(
        sessionInfo.scanId, 
        sessionInfo.securityToken, 
        sessionInfo.apiBaseUrl, 
        sessionInfo.assetConfigId, 
        sessionInfo.mode
    );
  };

  const renderSDK = (prism: any, config: PrismConfig) => {
    if (initializedRef.current || !containerRef.current) return;
    
    console.log("[Scanner] Executing Prism.render...");

    try {
        prism.render({
            ...config,
            container: containerRef.current
        });
        initializedRef.current = true;
        
        // Clear our loading state immediately so the Prism UI can be seen/touched
        setIsLoading(false);
        setStatusMessage("");
    } catch (err: any) {
        console.error("[Scanner] Prism.render exception:", err);
        setError(`Failed to mount scanner: ${err.message}`);
        setIsLoading(false);
    }
  };

  const waitForSDK = (scanId: string, securityToken: string, apiBaseUrl: string, assetConfigId: string, mode: string) => {
    const config: PrismConfig = {
        apiKey: "token_based_auth", 
        scanId, 
        token: securityToken,
        mode, 
        apiBaseUrl,
        assetConfigId,
        onSuccess: (data: any) => {
            console.log("[Scanner] Success:", data);
            onComplete(data);
        },
        onFailure: (err: any) => {
            console.error('[Scanner] Failure:', err);
            setError(
                <div className="text-center px-6">
                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <p className="font-bold text-white mb-2">Scanner Error</p>
                    <p className="text-sm text-zinc-400">{err.message || "Ensure you are in a well-lit area and allowed camera access."}</p>
                </div>
            );
            setIsLoading(false);
        },
        onClose: () => onClose()
    };

    // Try finding Prism from various possible locations (Module export or Window global)
    const prism = (window as any).Prism || (PrismModule as any).Prism || (PrismModule as any).default?.Prism;

    if (prism) {
        renderSDK(prism, config);
        return;
    }

    // Listener for late-loading script
    const handlePrismLoaded = (event: PrismLoadedEvent) => {
        const p = event.detail.prism;
        renderSDK(p, config);
    };

    window.addEventListener('onPrismLoaded', handlePrismLoaded);
    
    // Final safety interval
    const checkInterval = setInterval(() => {
        const p = (window as any).Prism || (PrismModule as any).Prism;
        if (p && !initializedRef.current) {
            renderSDK(p, config);
            clearInterval(checkInterval);
        }
    }, 500);

    setTimeout(() => {
        clearInterval(checkInterval);
        if (!initializedRef.current) {
            setError("The scanning engine took too long to load. Please refresh.");
            setIsLoading(false);
        }
    }, 15000);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    startSession();
    return () => { document.body.style.overflow = ''; };
  }, [retryCount]);

  const handleRetry = () => {
      initializedRef.current = false;
      setRetryCount(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col items-center justify-center font-sans overflow-hidden">
      {/* Container for Prism SDK - Needs to be visible for initialization */}
      <div 
        ref={containerRef} 
        id="prism-container"
        className="absolute inset-0 w-full h-full bg-black z-10" 
      />

      {/* Manual Start Gesture Screen */}
      {isReadyToStart && !isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[40] p-8 text-center animate-in fade-in duration-300">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/20">
                <Camera className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Ready to Scan</h2>
            <p className="text-zinc-400 text-sm mb-10 max-w-xs">
                Camera access granted. Click below to initialize the 3D scanning interface.
            </p>
            <button 
                onClick={handleStartScanner}
                className="w-full max-w-xs py-5 bg-emerald-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 active:scale-[0.98]"
            >
                <Play className="w-6 h-6 fill-current" />
                Initialize Scanner
            </button>
            <button onClick={onClose} className="mt-8 text-zinc-500 text-sm hover:text-white transition-colors">
                Cancel
            </button>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-[50] backdrop-blur-sm pointer-events-none">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-6" />
          <p className="text-zinc-100 text-lg font-semibold">{statusMessage}</p>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[60] p-8 text-center">
          <div className="mb-10 w-full flex justify-center">{error}</div>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button onClick={handleRetry} className="w-full py-4 bg-emerald-600 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <RefreshCcw className="w-5 h-5" /> Try Again
            </button>
            <button onClick={onClose} className="w-full py-4 bg-zinc-800 rounded-xl font-semibold text-zinc-400">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};
