import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, Camera, CheckCircle2 } from 'lucide-react';

interface ScannerProps {
  onClose: () => void;
  onComplete: (results: any) => void;
}

declare global {
  interface Window {
    prism?: any;
  }
}

export const Scanner: React.FC<ScannerProps> = ({ onClose, onComplete }) => {
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load Prism SDK
  useEffect(() => {
    const handlePrismLoaded = (event: CustomEvent) => {
      console.log("[Scanner] Prism SDK Event Received", event.detail);
      if (event.detail && event.detail.prism) {
        const prism = event.detail.prism;

        // Minimal config + callbacks
        prism.render({
          onSuccess: (data: any) => {
            console.log("✅ Prism onSuccess fired with results:", data);
            onComplete(data);        // ← This saves the scan and moves to dashboard
            onClose();
          },
          onFailure: (err: any) => {
            console.error("❌ Prism onFailure:", err);
            setError(err.message || "Scan failed");
            setIsScanning(false);
          },
          onClose: () => {
            console.log("Prism modal closed by user");
            onClose();
          }
        });
      }
    };

    window.addEventListener('onPrismLoaded', handlePrismLoaded as EventListener);

    const scriptUrl = "https://cdn.prismlabs.tech/prism.js";
    let script = document.querySelector(`script[src="${scriptUrl}"]`) as HTMLScriptElement;

    if (!script) {
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      document.body.appendChild(script);
    } else if (window.prism) {
      window.prism.render({});
    }

    return () => window.removeEventListener('onPrismLoaded', handlePrismLoaded as EventListener);
  }, [onComplete, onClose]);

  const handleStartScan = () => {
    setIsScanning(true);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex items-center justify-center overflow-hidden">

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

      {/* Overlay */}
      {!isScanning && !error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-xl">
          <div className="flex flex-col items-center p-8 text-center max-w-sm mx-auto">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-emerald-500/20">
              <Camera className="w-10 h-10 text-emerald-400" />
            </div>

            <h2 className="text-2xl font-bold mb-3">Scanner Ready</h2>

            <div className="flex flex-col gap-2 text-sm text-zinc-400 mb-8 w-full">
              <div className="flex items-center justify-between px-4 py-2 bg-black/20 rounded-lg">
                <span>Secure Tunnel</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex items-center justify-between px-4 py-2 bg-black/20 rounded-lg">
                <span>3D Engine</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
            </div>

            <button 
              className="prism-button w-full py-5 rounded-2xl font-bold text-lg bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={handleStartScan}
            >
              Start Scan
            </button>

            <button onClick={onClose} className="mt-6 text-zinc-500 text-sm hover:text-zinc-300">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/95">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-white font-semibold mb-6">{error}</p>
            <button onClick={onClose} className="px-8 py-3 bg-white text-black rounded-xl font-bold">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};