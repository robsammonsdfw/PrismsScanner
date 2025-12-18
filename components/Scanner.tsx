
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
    console.log("[Scanner] Phase 1: Requesting session from backend...");
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
      
      console.log("[Scanner] Phase 1 Success: Session received", sessionData.scanId);
      
      if (!sessionData.scanId || !sessionData.securityToken) {
          throw new Error("Invalid session data: Missing scanId or token");
      }

      setSessionInfo(sessionData);
      setIsReadyToStart(true);
      setIsLoading(false);
    } catch (err: any) {
      console.error("[Scanner] Phase 1 Error:", err);
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
    console.log("[Scanner] Phase 2: User clicked 'Initialize Scanner'");
    if (!sessionInfo) return;
    setIsLoading(true);
    setStatusMessage("Starting camera system...");
    
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
    
    console.log("[Scanner] Phase 4: Found SDK! Attempting render...");
    console.log("[Scanner] Target Container:", containerRef.current);
    console.log("[Scanner] Render Config:", { ...config, token: "REDACTED" });

    try {
        if (typeof prism.render !== 'function') {
            throw new Error("SDK found but 'render' is not a function. Check console for SDK object structure.");
        }

        prism.render({
            ...config,
            container: containerRef.current
        });
        
        initializedRef.current = true;
        console.log("[Scanner] Phase 5: render() called successfully.");
        
        // Clear loading overlay
        setIsLoading(false);
        setStatusMessage("");
    } catch (err: any) {
        console.error("[Scanner] Phase 4 Render Exception:", err);
        setError(`Failed to mount scanner: ${err.message}`);
        setIsLoading(false);
    }
  };

  const findPrismInstance = () => {
    // Extensive check of common export patterns
    const fromWindow = (window as any).Prism;
    const fromModuleProp = (PrismModule as any).Prism;
    const fromModuleDefault = (PrismModule as any).default;
    const fromModuleDefaultPrism = (PrismModule as any).default?.Prism;

    console.log("[Scanner] SDK Discovery Check:", {
        windowPrism: !!fromWindow,
        modulePrism: !!fromModuleProp,
        moduleDefault: !!fromModuleDefault,
        moduleDefaultPrism: !!fromModuleDefaultPrism
    });

    return fromWindow || fromModuleProp || fromModuleDefaultPrism || fromModuleDefault;
  };

  const waitForSDK = (scanId: string, securityToken: string, apiBaseUrl: string, assetConfigId: string, mode: string) => {
    console.log("[Scanner] Phase 3: Waiting for SDK to be available in memory...");
    
    const config: PrismConfig = {
        apiKey: "token_based_auth", 
        scanId, 
        token: securityToken,
        mode, 
        apiBaseUrl,
        assetConfigId,
        onSuccess: (data: any) => {
            console.log("[Scanner] SDK Callback: onSuccess", data);
            onComplete(data);
        },
        onFailure: (err: any) => {
            console.error('[Scanner] SDK Callback: onFailure', err);
            setError(
                <div className="text-center px-6">
                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <p className="font-bold text-white mb-2">Scanner Error</p>
                    <p className="text-sm text-zinc-400">{err.message || "Ensure camera permissions are granted and you are in a well-lit area."}</p>
                </div>
            );
            setIsLoading(false);
        },
        onClose: () => {
            console.log("[Scanner] SDK Callback: onClose");
            onClose();
        }
    };

    // Immediate check
    const prism = findPrismInstance();
    if (prism && typeof prism.render === 'function') {
        renderSDK(prism, config);
        return;
    }

    // Listener for the custom event defined in SDK docs
    const handlePrismLoaded = (event: PrismLoadedEvent) => {
        console.log("[Scanner] Event 'onPrismLoaded' received!");
        const p = event.detail.prism;
        renderSDK(p, config);
    };

    window.addEventListener('onPrismLoaded', handlePrismLoaded);
    
    // Safety interval to catch it if event is missed
    let attempts = 0;
    const checkInterval = setInterval(() => {
        attempts++;
        const p = findPrismInstance();
        
        if (p && typeof p.render === 'function') {
            console.log(`[Scanner] SDK found via interval after ${attempts} checks.`);
            renderSDK(p, config);
            clearInterval(checkInterval);
        } else if (attempts % 5 === 0) {
            console.log(`[Scanner] Still waiting... attempt ${attempts}`);
        }
    }, 500);

    // Timeout
    setTimeout(() => {
        clearInterval(checkInterval);
        window.removeEventListener('onPrismLoaded', handlePrismLoaded);
        
        if (!initializedRef.current) {
            console.error("[Scanner] Timeout: SDK not found or missing .render method.");
            const p = findPrismInstance();
            const detail = p ? `Found object keys: ${Object.keys(p).join(', ')}` : "No object found.";
            setError(
                <div className="space-y-4">
                    <p>The scanning engine took too long to load.</p>
                    <p className="text-[10px] text-zinc-500 font-mono bg-black/30 p-2 rounded">{detail}</p>
                </div>
            );
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
      <div 
        ref={containerRef} 
        id="prism-container"
        className="absolute inset-0 w-full h-full bg-black z-10" 
      />

      {isReadyToStart && !isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[40] p-8 text-center animate-in fade-in duration-300">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/20">
                <Camera className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Ready to Scan</h2>
            <p className="text-zinc-400 text-sm mb-10 max-w-xs">
                Session created. Click below to launch the 3D scanning interface.
            </p>
            <button 
                onClick={handleStartScanner}
                className="w-full max-w-xs py-5 bg-emerald-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
            >
                <Play className="w-6 h-6 fill-current" />
                Initialize Scanner
            </button>
            <button onClick={onClose} className="mt-8 text-zinc-500 text-sm hover:text-white transition-colors">
                Cancel
            </button>
        </div>
      )}

      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-[50] backdrop-blur-sm pointer-events-none transition-opacity duration-300">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-6" />
          <p className="text-zinc-100 text-lg font-semibold">{statusMessage}</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[60] p-8 text-center overflow-y-auto">
          <div className="mb-10 w-full flex justify-center text-white">{error}</div>
          <div className="flex flex-col gap-4 w-full max-w-xs shrink-0">
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
