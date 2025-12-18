
import React, { useEffect, useRef, useState } from 'react';
import '@prismlabs/web-scan-ui-kit';

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
          throw new Error("Invalid session data returned from server.");
      }

      setSessionInfo(sessionData);
      setIsReadyToStart(true);
      setStatusMessage("Connection established.");
      setIsLoading(false);
    } catch (err: any) {
      console.error("[Scanner] startSession failed:", err);
      setIsLoading(false);
      setError(
          <div className="text-center w-full max-w-sm px-6">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="font-bold text-slate-100 mb-2 text-xl">Connection Error</p>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{err.message || "Failed to initialize session"}</p>
          </div>
      );
    }
  };

  const handleStartScanner = async () => {
    if (!sessionInfo) return;
    
    setIsLoading(true);
    setStatusMessage("Requesting camera access...");

    // 1. Explicitly request camera to "prime" the browser permission
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        // Close it immediately so Prism can take over the hardware
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        console.warn("[Scanner] Pre-check camera permission failed:", err);
        // We don't throw here, let Prism try its own way
    }

    // 2. Wait for SDK and render
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
    
    console.log("[Scanner] Rendering Prism SDK...");

    try {
        prism.render({
            ...config,
            container: containerRef.current
        });
        initializedRef.current = true;
        // Fade out our loader once render is called
        setTimeout(() => setIsLoading(false), 2000);
    } catch (err: any) {
        console.error("[Scanner] Prism.render failed:", err);
        setError(`Render Error: ${err.message}`);
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
        translationOverrides: {
            leveling: { title: "Hold phone vertically" },
        },
        onSuccess: (data: any) => {
            console.log("[Scanner] Success Callback:", data);
            onComplete(data);
        },
        onFailure: (err: any) => {
            console.error('[Scanner] onFailure Callback:', err);
            setError(
                <div className="text-center px-6">
                    <Camera className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <p className="font-bold text-white mb-2">Camera Error</p>
                    <p className="text-sm text-zinc-400">{err.message || "Please check camera permissions in your browser settings."}</p>
                </div>
            );
            setIsLoading(false);
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
    
    // Safety check interval
    const checkInterval = setInterval(() => {
        const prism = (window as any).Prism;
        if (prism && !initializedRef.current) {
            renderSDK(prism, config);
            clearInterval(checkInterval);
        }
    }, 1000);

    setTimeout(() => clearInterval(checkInterval), 15000);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    startSession();
    return () => { 
        document.body.style.overflow = '';
    };
  }, [retryCount]);

  const handleRetry = () => {
      initializedRef.current = false;
      setRetryCount(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col items-center justify-center font-sans overflow-hidden">
      {/* Container for Prism SDK - Always on bottom, but visible */}
      <div 
        ref={containerRef} 
        id="prism-container"
        className="absolute inset-0 w-full h-full bg-black z-10" 
      />

      {/* Manual Start Gesture Screen */}
      {isReadyToStart && !isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[40] p-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/20">
                <Camera className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Ready to Scan</h2>
            <p className="text-zinc-400 text-sm mb-10 max-w-xs leading-relaxed">
                To begin your 3D scan, we need to access your camera. Please click the button below and "Allow" access.
            </p>
            <button 
                onClick={handleStartScanner}
                className="w-full max-w-xs py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
                <Play className="w-6 h-6 fill-current" />
                Start Camera
            </button>
            <button onClick={onClose} className="mt-6 text-zinc-500 text-sm font-medium hover:text-white transition-colors">
                Cancel
            </button>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 z-[50] backdrop-blur-sm transition-opacity duration-500">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-6" />
          <div className="text-center space-y-2 px-6">
            <p className="text-zinc-100 text-lg font-semibold">{statusMessage}</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Secure Connection Active</p>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-[60] p-8 text-center">
          <div className="mb-10 w-full flex justify-center">{error}</div>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button onClick={handleRetry} className="w-full py-4 bg-emerald-600 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
                <RefreshCcw className="w-5 h-5" /> Try Again
            </button>
            <button onClick={onClose} className="w-full py-4 bg-zinc-800 rounded-xl font-semibold text-zinc-400">Return to Home</button>
          </div>
        </div>
      )}
    </div>
  );
};
