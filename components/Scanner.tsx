import React, { useEffect, useRef, useState } from 'react';
import { initScanSession } from '../services/api';
import { Loader2, AlertTriangle, RefreshCcw, Camera, CheckCircle2, LogOut } from 'lucide-react';

interface ScannerProps {
  onClose: () => void;
  onComplete: (results: any) => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onClose, onComplete }) => {
  const [prismInstance, setPrismInstance] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState<number>(0);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Load Prism SDK Script & Listen for Event
  useEffect(() => {
    const handlePrismLoaded = (event: CustomEvent) => {
      console.log("[Scanner] Prism SDK Event Received", event.detail);
      if (event.detail && event.detail.prism) {
        const prism = event.detail.prism;
        setPrismInstance(prism);

        // Minimal render call - as per Prism developer
        console.log("✅ Calling prism.render({}) with minimal config");
        prism.render({});
      }
    };

    window.addEventListener('onPrismLoaded', handlePrismLoaded as EventListener);

    const scriptUrl = "https://cdn.prismlabs.tech/prism.js";
    let script = document.querySelector(`script[src="${scriptUrl}"]`) as HTMLScriptElement;

    if (!script) {
      console.log("[Scanner] Injecting Prism SDK Script...");
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      document.body.appendChild(script);
    } else if (window.prism) {
      setPrismInstance(window.prism);
      window.prism.render({});
    }

    return () => {
      window.removeEventListener('onPrismLoaded', handlePrismLoaded as EventListener);
    };
  }, []);

  // Simple button handler - the SDK will open the modal itself
  const handleStartScan = () => {
    console.log("Prism button clicked - SDK should open modal");
    setIsScanning(true);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex items-center justify-center overflow-hidden">

      {/* Prism Container - must be present */}
      <div 
        id="prism-container"
        ref={containerRef}
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%',
          backgroundColor: 'transparent', 
          touchAction: 'none'
        }}
        className="absolute inset-0 w-full h-full z-0"
      />

      {/* Overlay UI */}
      {!isScanning && !error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="flex flex-col items-center p-8 text-center max-w-sm mx-auto">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-emerald-500/20">
              <Camera className="w-10 h-10 text-emerald-400" />
            </div>

            <h2 className="text-2xl font-bold mb-3 tracking-tight">Scanner Ready</h2>

            <div className="flex flex-col gap-2 text-sm text-zinc-400 mb-8 w-full">
              <div className="flex items-center justify-between px-4 py-2 bg-black/20 rounded-lg w-full">
                <span>Secure Tunnel</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex items-center justify-between px-4 py-2 bg-black/20 rounded-lg w-full">
                <span>3D Engine</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
            </div>

            {/* This is the important button */}
            <button 
              className="prism-button w-full py-5 rounded-2xl font-bold text-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 active:scale-95 cursor-pointer"
              onClick={handleStartScan}
            >
              Start Scan
            </button>

            <button onClick={onClose} className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error UI */}
      {error && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-md">
          <div className="flex flex-col items-center p-8 text-center max-w-xs mx-auto animate-in fade-in">
            <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
            <p className="text-white font-semibold mb-6">{error}</p>
            <button onClick={() => setRetryKey(k => k + 1)} className="w-full py-3 bg-white text-black rounded-xl font-bold">
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};