import React, { useEffect, useRef, useState } from 'react';
import { initScanSession } from '../services/api';
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
  const [debugLog, setDebugLog] = useState<string[]>(["Scanner mounted"]);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLog(prev => [...prev, msg]);
  };

  useEffect(() => {
    addLog("1. Starting initScanSession...");

    const load = async () => {
      try {
        const sessionData = await initScanSession();
        addLog("2. Session received from backend ✅");

        const handlePrismLoaded = (event: CustomEvent) => {
          addLog("3. Prism SDK loaded - calling render()");
          if (event.detail?.prism) {
            const prism = event.detail.prism;

            prism.render({
              apiKey: "token_based_auth",
              scanId: sessionData.scanId,
              prismScanId: sessionData.prismScanId || sessionData.scanId,
              token: sessionData.securityToken,
              mode: sessionData.mode || "production",
              apiBaseUrl: sessionData.apiBaseUrl || sessionData.baseUrl,
              assetConfigId: sessionData.assetConfigId,
              container: "prism-container",
              screen: "capture",

              onSuccess: (data: any) => {
                addLog("4. ✅ onSuccess FIRED - View Results clicked!");
                onComplete(data);
                onClose();
              },
              onFailure: (err: any) => {
                addLog("❌ onFailure: " + (err?.message || "Unknown"));
                setError(err?.message || "Scan failed");
              },
              onClose: () => {
                addLog("Prism modal closed by user");
                onClose();
              }
            });
          }
        };

        window.addEventListener('onPrismLoaded', handlePrismLoaded as EventListener);

        const scriptUrl = "https://cdn.prismlabs.tech/prism.js";
        if (!document.querySelector(`script[src="${scriptUrl}"]`)) {
          const script = document.createElement("script");
          script.src = scriptUrl;
          script.async = true;
          document.body.appendChild(script);
          addLog("SDK script injected");
        }
      } catch (err: any) {
        addLog("ERROR: " + err.message);
        setError(err.message);
      }
    };

    load();

    return () => {
      window.removeEventListener('onPrismLoaded', (() => {}) as EventListener);
    };
  }, [onComplete, onClose]);

  const handleStartScan = () => {
    addLog("Start Scan button clicked");
    setIsScanning(true);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex items-center justify-center overflow-hidden">

      {/* Prism container */}
      <div id="prism-container" ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'transparent' }} />

      {/* Debug panel - visible on iPhone */}
      <div className="absolute top-4 left-4 right-4 bg-black/80 text-xs font-mono p-3 rounded-2xl z-[200] max-h-40 overflow-auto border border-emerald-500/30">
        <div className="text-emerald-400 mb-1 font-bold">DEBUG LOG</div>
        {debugLog.map((line, i) => (
          <div key={i} className="text-emerald-100 py-0.5">{line}</div>
        ))}
      </div>

      {/* Normal overlay */}
      {!isScanning && !error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-xl">
          <div className="flex flex-col items-center p-8 text-center max-w-sm mx-auto">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-emerald-500/20">
              <Camera className="w-10 h-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Scanner Ready</h2>

            <button className="prism-button w-full py-5 rounded-2xl font-bold text-lg bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handleStartScan}>
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
          <div className="text-center p-8">
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