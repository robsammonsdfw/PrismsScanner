import React, { useEffect, useRef, useState } from 'react';
// Importing the package often triggers the injection or availability of the global event
import '@prismlabs/web-scan-ui-kit';

import { PrismConfig, PrismLoadedEvent } from '../types';
import { PRISM_CONFIG_PLACEHOLDERS } from '../constants';
import { Loader2, X } from 'lucide-react';

interface ScannerProps {
  onClose: () => void;
  onComplete: (results: any) => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onClose, onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handlePrismLoaded = (event: PrismLoadedEvent) => {
      console.log('Prism SDK Loaded');
      setIsLoading(false);

      const prism = event.detail.prism;

      if (!containerRef.current) {
        console.error('Scanner container not found');
        return;
      }

      // CONFIGURATION OBJECT
      // !! CRITICAL !!: Check `node_modules/@prismlabs/web-scan-ui-kit/documentation/`
      // for the exact configuration schema required by your version.
      const config: PrismConfig = {
        apiKey: PRISM_CONFIG_PLACEHOLDERS.API_KEY,
        // Depending on the SDK version, you might need scanId or token
        scanId: PRISM_CONFIG_PLACEHOLDERS.SCAN_ID, 
        // token: PRISM_CONFIG_PLACEHOLDERS.TOKEN,
        
        // Helper to mount to our specific React ref
        container: containerRef.current,

        // Translation Override Example (as requested)
        translationOverrides: {
          leveling: {
            title: "Please hold your phone vertically", // Customizing the text
          },
        },

        // Event Callbacks
        onSuccess: (data) => {
          console.log('Scan completed successfully', data);
          onComplete(data);
        },
        onFailure: (err) => {
          console.error('Scan failed', err);
          setError('An error occurred during the scan initialization.');
        },
        onClose: () => {
          console.log('User closed scanner');
          onClose();
        }
      };

      try {
        prism.render(config);
      } catch (err) {
        console.error("Failed to render Prism UI:", err);
        setError("Failed to initialize camera UI.");
      }
    };

    // Listen for the library's ready event
    window.addEventListener('onPrismLoaded', handlePrismLoaded);

    // Timeout fallback in case the event never fires (e.g., script load error)
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        // It's possible the event fired before we mounted. 
        // In a real integration, check if `window.Prism` or similar global exists.
        // For now, we just show a timeout warning.
        console.warn("Waiting for Prism SDK...");
      }
    }, 5000);

    return () => {
      window.removeEventListener('onPrismLoaded', handlePrismLoaded);
      clearTimeout(timeoutId);
      // If the SDK provides a destroy method, call it here.
      // e.g., if (window.prismInstance) window.prismInstance.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col items-center justify-center">
      {/* Fullscreen Container for the SDK */}
      <div 
        ref={containerRef} 
        id="prism-scanner-container"
        className="absolute inset-0 w-full h-full bg-black" 
      />

      {/* Custom Loading Overlay (visible until SDK renders) */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-[60]">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
          <p className="text-zinc-400 animate-pulse">Initializing 3D Scanner...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-[70] p-6 text-center">
          <div className="bg-red-900/20 p-4 rounded-full mb-4">
            <X className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Initialization Error</h3>
          <p className="text-zinc-400 mb-6">{error}</p>
          <button 
            onClick={onClose}
            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-semibold transition-colors"
          >
            Return to Home
          </button>
        </div>
      )}
    </div>
  );
};