
import React, { useEffect, useRef, useState } from 'react';
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

  // 1. Inject Prism CSS dynamically if missing
  useEffect(() => {
    const cssId = 'prism-ui-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      // Fallback to a common CDN path for the CSS
      link.href = 'https://aistudiocdn.com/@prismlabs/web-scan-ui-kit@^1.0.0/dist/index.css';
      document.head.appendChild(link);
      console.log("[Scanner] Injected Prism CSS");
    }
  }, []);

  const startSession = async () => {
    console.log("[Scanner] Phase 1: Requesting session...");
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

      const sessionData = await initScanSession(getDeviceConfig());
      console.log("[Scanner] Phase 1 Success:", sessionData.scanId);
      
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
              <p className="text-sm text-zinc-400 mb-6">{err.message}</p>
          </div>
      );
    }
  };

  const handleStartScanner = () => {
    console.log("[Scanner] Phase 2: Starting Scanner process");
    if (!sessionInfo) return;
    
    // CRITICAL FIX: Hide the "Ready" screen immediately so it doesn't cover the scanner
    setIsReadyToStart(false);
    setIsLoading(true);
    setStatusMessage("Initializing 3D scanning engine...");
    
    waitForSDK(
        sessionInfo.scanId, 
        sessionInfo.securityToken, 
        sessionInfo.apiBaseUrl, 
        sessionInfo.assetConfigId, 
        sessionInfo.mode
    );
  };

  const findPrismInstance = () => {
    const fromWindow = (window as any).Prism;
    const fromModuleProp = (PrismModule as any).Prism;
    const fromModuleDefault = (PrismModule as any).default;
    const fromModuleDefaultPrism = (PrismModule as any).default?.Prism;

    const instance = fromWindow || fromModuleProp || fromModuleDefaultPrism || fromModuleDefault;
    
    if (instance) {
      console.log("[Scanner] Found SDK Instance. Structure:");
      console.dir(instance);
    }
    
    return instance;
  };

  const renderSDK = (prism: any, config: PrismConfig) => {
    if (initializedRef.current || !containerRef.current) return;
    
    console.log("[Scanner] Phase 4: Attempting render...");

    try {
        if (typeof prism.render !== 'function') {
            const keys = Object.keys(prism).join(', ');
            throw new Error(`SDK object found but missing .render(). Keys: ${keys}`);
        }

        prism.render({
            ...config,
            container: containerRef.current
        });
        
        initializedRef.current = true;
        console.log("[Scanner] Phase 5: render() executed.");
        
        setIsLoading(false);
        setStatusMessage("");
    } catch (err: any) {
        console.error("[Scanner] Phase 4 Error:", err);
        setError(`Scanner mounting failed: ${err.message}`);
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
        onSuccess: (data: any) => onComplete(data),
        onFailure: (err: any) => {
            setError(<p className="text-sm text-zinc-400">{err.message || "Scanner failure."}</p>);
            setIsLoading(false);
        },
        onClose: () => onClose()
    };

    const prism = findPrismInstance();
    if (prism && typeof prism.render === 'function') {
        renderSDK(prism, config);
        return;
    }

    let attempts = 0;
    const checkInterval = setInterval(() => {
        attempts++;
        const p = findPrismInstance();
        if (p && typeof p.render === 'function') {
            renderSDK(p, config);
            clearInterval(checkInterval);
        }
    }, 300);

    setTimeout(() => {
        clearInterval(checkInterval);
        if (!initializedRef.current) {
            console.error("[Scanner] Timeout: Could not find render function.");
            setError("The scanning engine took too long to load. Please try refreshing.");
            setIsLoading(false);
        }
    }, 12000);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    startSession();
    return () => { document.body.style.overflow = ''; };
  }, [retryCount]);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col items-center justify-center font-sans overflow-hidden">
      {/* Container - Ensure high z-index when active */}
      <div 
        ref={containerRef} 
        id="prism-container"
        className={`absolute inset-0 w-full h-full bg-black ${initializedRef.current ? 'z-30' : 'z-10'}`} 
      />

      {/* Manual Start Gesture Screen */}
      {isReadyToStart && !isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[40] p-8 text-center animate-in fade-in">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/20">
                <Camera className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Ready to Scan</h2>
            <p className="text-zinc-400 text-sm mb-10 max-w-xs">Click below to start the 3D scanning interface.</p>
            <button 
                onClick={handleStartScanner}
                className="w-full max-w-xs py-5 bg-emerald-600 text-white rounded-2xl font-bold text-lg active:scale-95 transition-transform"
            >
                Initialize Scanner
            </button>
            <button onClick={onClose} className="mt-8 text-zinc-500 text-sm">Cancel</button>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 z-[50] backdrop-blur-sm pointer-events-none transition-opacity">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-6" />
          <p className="text-zinc-100 text-lg font-semibold">{statusMessage}</p>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[60] p-8 text-center">
          <div className="mb-10 text-white">{error}</div>
          <button onClick={() => setRetryCount(prev => prev + 1)} className="w-full max-w-xs py-4 bg-emerald-600 rounded-xl font-bold">Try Again</button>
          <button onClick={onClose} className="mt-4 text-zinc-500">Cancel</button>
        </div>
      )}
    </div>
  );
};
