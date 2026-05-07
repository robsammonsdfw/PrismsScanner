import React, { useEffect, useState } from 'react';
import { initScanSession } from '../services/api';

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
  const [prismReady, setPrismReady] = useState(false);
  const [prismInstance, setPrismInstance] = useState<any>(null);

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLog(prev => [...prev, msg]);
  };

  useEffect(() => {
    addLog("1. Scanner mounted - fetching session");

    const load = async () => {
      try {
        await initScanSession();
        addLog("2. Session received from backend ✅");

        const handlePrismLoaded = (event: CustomEvent) => {
          addLog("3. Prism SDK loaded - ready");
          if (event.detail?.prism) {
            setPrismInstance(event.detail.prism);
            setPrismReady(true);
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
  }, []);

  const startPrismScan = () => {
    addLog("Start Scan clicked");
    if (prismInstance) {
      addLog("Triggering Prism render...");
      prismInstance.render({
        onSuccess: (result: any) => {
          addLog("✅ PRISM ONSUCCESS FIRED");
          addLog("Keys: " + Object.keys(result || {}).join(", "));
          onComplete(result);
          onClose();
        },
        onFailure: (err: any) => {
          addLog("❌ Prism Failure: " + (err?.message || JSON.stringify(err)));
          setError(err?.message || "Scan failed");
        },
        onClose: () => onClose()
      });
    } else {
      addLog("Prism not ready yet");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden">

      <div id="prism-container" style={{ width: '100%', height: '100%' }} />

      {/* Debug Panel */}
      <div className="absolute top-4 left-4 right-4 bg-black/90 text-xs font-mono p-3 rounded-2xl z-[200] max-h-48 overflow-auto border border-emerald-400">
        <div className="text-emerald-400 mb-1 font-bold">DEBUG LOG (live)</div>
        {debugLog.map((line, i) => (
          <div key={i} className="text-emerald-100 py-px text-[10px]">{line}</div>
        ))}
      </div>

      {/* Start Button */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[150]">
        <button 
          className="px-10 py-5 rounded-2xl font-bold text-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg disabled:opacity-50"
          onClick={startPrismScan}
          disabled={!prismReady}
        >
          {prismReady ? "Start Scan" : "Loading Prism..."}
        </button>
      </div>

      {error && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/90">
          <div className="text-center p-8">
            <p className="text-red-500">{error}</p>
            <button onClick={onClose} className="mt-4 px-6 py-3 bg-white text-black rounded-xl">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};