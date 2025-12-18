
import React, { useEffect, useRef, useState } from 'react';
import * as PrismModule from '@prismlabs/web-scan-ui-kit';
import { PrismConfig } from '../types';
import { initScanSession } from '../services/api';
import { Loader2, AlertTriangle, RefreshCcw, Camera, Info } from 'lucide-react';

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
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [retryKey, setRetryKey] = useState<number>(0);

  // Phase 1: Get Session from Backend
  useEffect(() => {
    const startSession = async () => {
      setIsLoading(true);
      setError(null);
      setStatusMessage("Connecting to Secure Tunnel...");
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

  // Phase 2: User clicks start - This is where we hook into the SDK
  const handleStartScanner = () => {
    if (!sessionInfo) return;
    setIsReadyToStart(false);
    setIsLoading(true);
    setStatusMessage("Activating 3D Engine...");
    
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      
      // 1. Log what we see for debugging
      const windowPrism = (window as any).Prism;
      const moduleKeys = Object.keys(PrismModule || {});
      const defaultKeys = (PrismModule as any).default ? Object.keys((PrismModule as any).default) : [];
      
      // 2. Try to resolve the 'prism' object from multiple common patterns
      let prism: any = null;
      
      if (typeof windowPrism?.render === 'function') {
        prism = windowPrism;
      } else if (typeof (PrismModule as any).render === 'function') {
        prism = PrismModule;
      } else if (typeof (PrismModule as any).Prism?.render === 'function') {
        prism = (PrismModule as any).Prism;
      } else if (typeof (PrismModule as any).default?.render === 'function') {
        prism = (PrismModule as any).default;
      } else if (typeof (PrismModule as any).default?.Prism?.render === 'function') {
        prism = (PrismModule as any).default.Prism;
      }

      if (prism && typeof prism.render === 'function') {
        clearInterval(checkInterval);
        console.log("[Scanner] SUCCESS: Found Prism SDK render function.");
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
              setError(err.message || "Scanner encountered an error.");
              setIsLoading(false);
            },
            onClose: () => onClose()
          });
          initializedRef.current = true;
          setIsLoading(false);
        } catch (e: any) {
          console.error("[Scanner] Render crash:", e);
          setError(`Engine Mount Error: ${e.message}`);
          setIsLoading(false);
        }
      } else if (attempts > 50) { // 5 seconds
        clearInterval(checkInterval);
        const diagnosticReport = [
          `Window.Prism: ${!!windowPrism}`,
          `Module Keys: ${moduleKeys.slice(0, 5).join(', ')}`,
          `Default Keys: ${defaultKeys.slice(0, 5).join(', ')}`,
          `Attempts: ${attempts}`
        ].join(' | ');
        
        console.error("[Scanner] Discovery Timeout. Diagnostics:", diagnosticReport);
        setDebugInfo(diagnosticReport);
        setError("The 3D scanning engine failed to initialize.");
        setIsLoading(false);
      }
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex items-center justify-center overflow-hidden">
      {/* The Actual Scanner Output Layer */}
      <div 
        ref={containerRef} 
        id="prism-container"
        className={`absolute inset-0 w-full h-full bg-black ${initializedRef.current ? 'z-50' : 'z-10'}`} 
      />

      {/* Manual Entry Guard */}
      {isReadyToStart && !isLoading && !error && (
        <div className="relative z-[60] flex flex-col items-center p-10 text-center bg-slate-900/80 backdrop-blur-xl rounded-[2.5rem] border border-white/5 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-emerald-500/20">
                <Camera className="w-10 h-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold mb-3 tracking-tight">Ready to Begin</h2>
            <p className="text-zinc-400 text-sm mb-10 max-w-[240px] leading-relaxed">Ensure you have good lighting and space to move around.</p>
            <button 
                onClick={handleStartScanner}
                className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-2xl font-bold text-lg transition-all shadow-[0_20px_40px_-15px_rgba(16,185,129,0.3)]"
            >
                Initialize Scanner
            </button>
            <button onClick={onClose} className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors">Cancel</button>
        </div>
      )}

      {/* Loading State Overlay */}
      {isLoading && !error && (
        <div className="relative z-[70] flex flex-col items-center text-center px-6">
          <div className="relative mb-8">
             <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
             <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 animate-pulse"></div>
          </div>
          <p className="text-zinc-100 text-lg font-semibold tracking-wide">{statusMessage}</p>
          <p className="text-zinc-500 text-xs mt-2 italic">Scanning systems coming online...</p>
        </div>
      )}

      {/* Diagnostic Error View */}
      {error && (
        <div className="relative z-[80] flex flex-col items-center p-8 text-center max-w-sm mx-auto animate-in fade-in duration-500">
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Engine Initialization Error</h3>
          <p className="text-zinc-400 text-sm mb-8 leading-relaxed">{error}</p>
          
          {debugInfo && (
            <div className="w-full mb-8 p-3 bg-zinc-900/50 rounded-lg border border-white/5 flex items-start gap-3 text-left">
                <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                <div className="overflow-hidden">
                    <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Diagnostics for Support</p>
                    <p className="text-[10px] text-zinc-400 font-mono break-all">{debugInfo}</p>
                </div>
            </div>
          )}

          <div className="flex flex-col gap-3 w-full">
            <button 
              onClick={() => setRetryKey(k => k + 1)} 
              className="w-full py-4 bg-white text-black rounded-2xl font-bold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
            >
                <RefreshCcw className="w-4 h-4" /> Try Again
            </button>
            <button onClick={onClose} className="w-full py-4 bg-zinc-900 text-zinc-400 rounded-2xl font-medium hover:text-white transition-colors">
                Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
