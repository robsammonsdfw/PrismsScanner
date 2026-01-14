
import React, { useEffect, useRef, useState } from 'react';
import { PrismConfig } from '../types';
import { initScanSession } from '../services/api';
import { Loader2, AlertTriangle, RefreshCcw, Camera, CheckCircle2, LogOut } from 'lucide-react';

interface ScannerProps {
  onClose: () => void;
  onComplete: (results: any) => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onClose, onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef<boolean>(false);
  
  // State
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [prismInstance, setPrismInstance] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Initializing secure tunnel...");
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [retryKey, setRetryKey] = useState<number>(0);

  // 1. Load Prism SDK Script & Listen for Event
  useEffect(() => {
    // Handler for the custom event
    const handlePrismLoaded = (event: CustomEvent) => {
      console.log("[Scanner] Prism SDK Event Received", event.detail);
      if (event.detail && event.detail.prism) {
        setPrismInstance(event.detail.prism);
      }
    };

    window.addEventListener('onPrismLoaded', handlePrismLoaded as EventListener);

    // Inject Script if not present
    const scriptUrl = "https://cdn.prismlabs.tech/prism.js";
    let script = document.querySelector(`script[src="${scriptUrl}"]`) as HTMLScriptElement;
    
    if (!script) {
      console.log("[Scanner] Injecting Prism SDK Script...");
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => console.log("[Scanner] Script tag loaded");
      script.onerror = () => setError("Failed to load 3D Scanning Engine. Check your connection.");
      document.body.appendChild(script);
    } else {
        console.log("[Scanner] Script already present.");
    }

    return () => {
      window.removeEventListener('onPrismLoaded', handlePrismLoaded as EventListener);
    };
  }, []);

  // 2. Fetch Backend Session
  useEffect(() => {
    const fetchSession = async () => {
      setError(null);
      try {
        const userAgent = navigator.userAgent || '';
        const device = /iPad|iPhone|iPod/.test(userAgent) ? 'IPHONE_SCANNER' : 'ANDROID_SCANNER';
        const data = await initScanSession(device);
        setSessionInfo(data);
      } catch (err: any) {
        console.error(err);
        if (err.message.includes("Session expired")) {
            setError("Session expired");
        } else {
            setError(err.message || "Failed to connect to scanning server.");
        }
      }
    };
    fetchSession();
  }, [retryKey]);

  // Combined Loading State
  const isReady = !!sessionInfo && !!prismInstance;

  // 3. Start The Scanner
  const handleStartScanner = () => {
    if (!isReady || !containerRef.current) return;

    setIsScanning(true);
    setStatusMessage("Starting 3D Camera...");

    try {
      console.log("[Scanner] Calling prism.render()...");
      prismInstance.render({
        apiKey: "token_based_auth", // As per their docs/example
        scanId: sessionInfo.scanId,
        token: sessionInfo.securityToken,
        mode: sessionInfo.mode,
        apiBaseUrl: sessionInfo.apiBaseUrl,
        assetConfigId: sessionInfo.assetConfigId,
        container: containerRef.current,
        onSuccess: (data: any) => onComplete(data),
        onFailure: (err: any) => {
          console.error("[Scanner] Failure Callback:", err);
          setError(err.message || "Scan failed. Please try again.");
          setIsScanning(false);
        },
        onClose: () => onClose()
      });
      initializedRef.current = true;
    } catch (e: any) {
      console.error("[Scanner] Render Exception:", e);
      setError(`Engine Error: ${e.message}`);
      setIsScanning(false);
    }
  };

  const isAuthError = error === "Session expired";

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex items-center justify-center overflow-hidden">
      {/* Target for Prism SDK */}
      <div 
        ref={containerRef} 
        id="prism-container"
        className={`absolute inset-0 w-full h-full bg-black ${initializedRef.current ? 'z-50' : 'z-10'}`} 
      />

      {/* Preparation UI (Before Start) */}
      {!initializedRef.current && !error && (
        <div className="relative z-[60] flex flex-col items-center p-8 text-center bg-slate-900/90 backdrop-blur-xl rounded-[2rem] border border-white/10 max-w-sm mx-auto animate-in fade-in zoom-in-95 duration-300 shadow-2xl">
            
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-emerald-500/20">
                {isReady ? (
                   <Camera className="w-10 h-10 text-emerald-400" />
                ) : (
                   <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                )}
            </div>

            <h2 className="text-2xl font-bold mb-3 tracking-tight">
                {isReady ? "Scanner Ready" : "System Check"}
            </h2>
            
            <div className="flex flex-col gap-2 text-sm text-zinc-400 mb-8 w-full">
                <div className="flex items-center justify-between px-4 py-2 bg-black/20 rounded-lg">
                    <span>Secure Tunnel</span>
                    {sessionInfo ? <CheckCircle2 className="w-4 h-4 text-emerald-500"/> : <Loader2 className="w-3 h-3 animate-spin"/>}
                </div>
                <div className="flex items-center justify-between px-4 py-2 bg-black/20 rounded-lg">
                    <span>3D Engine</span>
                    {prismInstance ? <CheckCircle2 className="w-4 h-4 text-emerald-500"/> : <Loader2 className="w-3 h-3 animate-spin"/>}
                </div>
            </div>

            <button 
                onClick={handleStartScanner}
                disabled={!isReady}
                className={`w-full py-5 rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-2
                    ${isReady 
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 active:scale-95 cursor-pointer' 
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
            >
                {isReady ? "Initialize Scanner" : "Loading..."}
            </button>
            
            <button onClick={onClose} className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors">
                Cancel
            </button>
        </div>
      )}

      {/* Error View */}
      {error && (
        <div className="relative z-[80] flex flex-col items-center p-8 text-center max-w-xs mx-auto animate-in fade-in">
          {isAuthError ? (
              <LogOut className="w-12 h-12 text-zinc-400 mb-4" />
          ) : (
              <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          )}
          
          <p className="text-white font-semibold mb-6">{isAuthError ? "For security, your session has timed out." : error}</p>
          
          {!isAuthError && (
              <div className="flex flex-col gap-3 w-full">
                <button onClick={() => setRetryKey(k => k + 1)} className="w-full py-3 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2">
                    <RefreshCcw className="w-4 h-4" /> Try Again
                </button>
                <button onClick={onClose} className="w-full py-3 bg-zinc-900 text-zinc-500 rounded-xl font-medium">Cancel</button>
              </div>
          )}
          {isAuthError && (
               <div className="flex flex-col gap-3 w-full">
                   <button 
                     onClick={() => window.location.href = 'https://main.embracehealth.ai'}
                     className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors"
                   >
                     Log In Again
                   </button>
               </div>
          )}
        </div>
      )}
    </div>
  );
};
