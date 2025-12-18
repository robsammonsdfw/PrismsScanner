
import React, { useEffect, useRef, useState } from 'react';
import * as PrismModule from '@prismlabs/web-scan-ui-kit';
import { PrismConfig } from '../types';
import { initScanSession } from '../services/api';
import { Loader2, AlertTriangle, RefreshCcw, Camera } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [retryKey, setRetryKey] = useState<number>(0);

  // Phase 1: Get Session from Backend
  useEffect(() => {
    const startSession = async () => {
      setIsLoading(true);
      setError(null);
      setStatusMessage("Connecting...");
      try {
        const userAgent = navigator.userAgent || '';
        const device = /iPad|iPhone|iPod/.test(userAgent) ? 'IPHONE_SCANNER' : 'ANDROID_SCANNER';
        const data = await initScanSession(device);
        setSessionInfo(data);
        setIsReadyToStart(true);
        setIsLoading(false);
      } catch (err: any) {
        setError(err.message || "Connection failed");
        setIsLoading(false);
      }
    };
    startSession();
  }, [retryKey]);

  // Phase 2: User clicks start
  const handleStartScanner = () => {
    if (!sessionInfo) return;
    setIsReadyToStart(false); // Hide the "Ready" screen immediately
    setIsLoading(true);
    setStatusMessage("Starting Camera...");
    
    // Discovery Loop
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      
      // Look for the Prism object anywhere it might be hiding
      const prism = (window as any).Prism || (PrismModule as any).Prism || (PrismModule as any).default || PrismModule;
      
      if (prism && typeof prism.render === 'function') {
        clearInterval(checkInterval);
        try {
          prism.render({
            apiKey: "token_based_auth",
            scanId: sessionInfo.scanId,
            token: sessionInfo.securityToken,
            mode: sessionInfo.mode,
            apiBaseUrl: sessionInfo.apiBaseUrl,
            assetConfigId: sessionInfo.assetConfigId,
            container: containerRef.current,
            onSuccess: (data: any) => onComplete(data),
            onFailure: (err: any) => {
              setError(err.message || "Scanner error");
              setIsLoading(false);
            },
            onClose: () => onClose()
          });
          initializedRef.current = true;
          setIsLoading(false);
        } catch (e: any) {
          setError(`Mount failed: ${e.message}`);
          setIsLoading(false);
        }
      } else if (attempts > 30) { // 3 seconds total
        clearInterval(checkInterval);
        setError("Scanning engine not found. Please refresh.");
        setIsLoading(false);
      }
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex items-center justify-center overflow-hidden">
      {/* Target for Prism SDK */}
      <div 
        ref={containerRef} 
        id="prism-container"
        className="absolute inset-0 w-full h-full bg-black z-10" 
      />

      {/* Start UI */}
      {isReadyToStart && !isLoading && !error && (
        <div className="relative z-[60] flex flex-col items-center p-8 text-center bg-slate-950/50 backdrop-blur-md rounded-3xl border border-white/10 max-w-xs mx-auto animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6">
                <Camera className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Ready to Scan</h2>
            <p className="text-zinc-400 text-sm mb-8 leading-relaxed">Position yourself in a clear space before starting.</p>
            <button 
                onClick={handleStartScanner}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
            >
                Initialize Scanner
            </button>
            <button onClick={onClose} className="mt-4 text-zinc-500 text-xs hover:underline">Cancel</button>
        </div>
      )}

      {/* Loader */}
      {isLoading && !error && (
        <div className="relative z-[70] flex flex-col items-center pointer-events-none">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
          <p className="text-zinc-400 text-sm font-medium tracking-wide">{statusMessage}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="relative z-[80] flex flex-col items-center p-8 text-center max-w-xs mx-auto">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-white font-semibold mb-6">{error}</p>
          <div className="flex flex-col gap-3 w-full">
            <button onClick={() => setRetryKey(k => k + 1)} className="w-full py-3 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2">
                <RefreshCcw className="w-4 h-4" /> Try Again
            </button>
            <button onClick={onClose} className="w-full py-3 bg-zinc-900 text-zinc-500 rounded-xl font-medium">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};
