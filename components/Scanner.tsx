import React, { useEffect, useRef, useState } from 'react';
import { initScanSession, getUploadUrl, uploadWebmToPrism } from '../services/api';
import { Loader2, AlertTriangle, Camera, Upload, CheckCircle2 } from 'lucide-react';

interface ScannerProps {
  onClose: () => void;
  onComplete: (results: any) => void;
}

declare global {
  interface Window {
    prism?: any;
  }
}

type UploadStage =
  | 'idle'
  | 'capturing'
  | 'getting_url'
  | 'uploading'
  | 'saving'
  | 'done'
  | 'error';

export const Scanner: React.FC<ScannerProps> = ({ onClose, onComplete }) => {
  const [debugLog, setDebugLog] = useState<string[]>(['Scanner mounted']);
  const [error, setError] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sessionData, setSessionData] = useState<any>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLog(prev => [...prev, msg]);
  };

  // ─── CORE: extract webm blob from whatever Prism returns ────────────────────
  const extractWebmBlob = (result: any): Blob | null => {
    // Prism web SDK may return the blob under several keys — check all of them
    const candidates = [
      result?.webm,
      result?.video,
      result?.captureData,
      result?.blob,
      result?.file,
      result?.data,
    ];

    for (const c of candidates) {
      if (c instanceof Blob) return c;
      // Sometimes it's a base64 string
      if (typeof c === 'string' && c.startsWith('data:video')) {
        addLog('Found base64 video — converting to Blob');
        const [header, b64] = c.split(',');
        const mime = header.match(/:(.*?);/)?.[1] || 'video/webm';
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
      }
    }
    return null;
  };

  // ─── CORE: full pipeline after Prism fires onSuccess ───────────────────────
  const handlePrismSuccess = async (result: any, session: any) => {
    addLog('✅ onSuccess fired — keys: ' + Object.keys(result || {}).join(', '));
    console.log('🔥 Full Prism onSuccess payload:', result);

    const prismScanId = result?.scanId || result?.id || session?.scanId;
    addLog('prismScanId: ' + (prismScanId || 'MISSING'));

    // ── Step 1: try to get webm blob ────────────────────────────────────────
    const webmBlob = extractWebmBlob(result);

    if (!webmBlob) {
      // No video returned — Prism web SDK may handle upload internally.
      // Log keys to help debug, then fall through to just save the record.
      addLog('⚠️  No webm blob found in result — skipping upload step');
      addLog('Result keys: ' + JSON.stringify(Object.keys(result || {})));
      addLog('Saving scan record without upload…');
      setUploadStage('saving');
      onComplete({ ...result, prismScanId, scanId: prismScanId });
      return;
    }

    addLog(`webm blob found ✅ size=${webmBlob.size} bytes type=${webmBlob.type}`);

    try {
      // ── Step 2: get signed upload URL from your backend ──────────────────
      setUploadStage('getting_url');
      addLog('Fetching signed upload URL…');
      const { url: uploadUrl } = await getUploadUrl(prismScanId);
      addLog('Upload URL received ✅');

      // ── Step 3: PUT webm to Prism storage ────────────────────────────────
      setUploadStage('uploading');
      addLog('Uploading webm to Prism…');

      // Use XHR so we can track progress
      await uploadWithProgress(uploadUrl, webmBlob, (pct) => {
        setUploadProgress(pct);
        if (pct % 25 === 0) addLog(`Upload progress: ${pct}%`);
      });

      addLog('Upload complete ✅');
      setUploadStage('saving');

      // ── Step 4: save record to your DB (backend will poll Prism for status) ─
      onComplete({ ...result, prismScanId, scanId: prismScanId });

    } catch (err: any) {
      addLog('❌ Upload failed: ' + err.message);
      setError('Upload failed: ' + err.message);
      setUploadStage('error');
    }
  };

  // XHR-based upload with progress reporting
  const uploadWithProgress = (url: string, blob: Blob, onProgress: (pct: number) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', blob.type || 'video/webm');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));
      xhr.timeout = 120_000; // 2 min timeout for large video files

      xhr.send(blob);
    });
  };

  // ─── Mount: init session + inject Prism SDK ─────────────────────────────────
  useEffect(() => {
    addLog('1. Scanner mounted — fetching session');

    let handlePrismLoaded: ((e: CustomEvent) => void) | null = null;

    const load = async () => {
      try {
        const data = await initScanSession();
        setSessionData(data);
        addLog('2. Session received ✅  scanId=' + data.scanId);

        // Capture session in closure so the Prism callback can reference it
        const capturedSession = data;

        handlePrismLoaded = (event: CustomEvent) => {
          addLog('3. Prism SDK loaded — calling render()');

          const prism = event.detail?.prism;
          if (!prism) {
            addLog('❌ No prism object in event');
            return;
          }

          setUploadStage('capturing');

          prism.render({
            onSuccess: (result: any) => {
              handlePrismSuccess(result, capturedSession);
            },
            onFailure: (err: any) => {
              const msg = err?.message || JSON.stringify(err);
              addLog('❌ Prism failure: ' + msg);
              setError('Scan failed: ' + msg);
              setUploadStage('error');
            },
            onClose: () => {
              addLog('Prism closed by user');
              onClose();
            },
          });
        };

        window.addEventListener('onPrismLoaded', handlePrismLoaded as EventListener);

        const scriptUrl = 'https://cdn.prismlabs.tech/prism.js';
        if (!document.querySelector(`script[src="${scriptUrl}"]`)) {
          const script = document.createElement('script');
          script.src = scriptUrl;
          script.async = true;
          document.body.appendChild(script);
          addLog('SDK script injected');
        }

      } catch (err: any) {
        addLog('ERROR: ' + err.message);
        setError(err.message);
        setUploadStage('error');
      }
    };

    load();

    return () => {
      if (handlePrismLoaded) {
        window.removeEventListener('onPrismLoaded', handlePrismLoaded as EventListener);
      }
    };
  }, []);

  // ─── Upload progress overlay ─────────────────────────────────────────────────
  const uploadOverlay = uploadStage !== 'idle' && uploadStage !== 'capturing' && uploadStage !== 'error' && (
    <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-xl">
      <div className="flex flex-col items-center p-8 text-center max-w-sm mx-auto w-full gap-6">

        {/* Animated icon */}
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center">
          {uploadStage === 'saving' ? (
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          ) : uploadStage === 'uploading' ? (
            <Upload className="w-10 h-10 text-emerald-400 animate-bounce" />
          ) : (
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
          )}
        </div>

        {/* Status text */}
        <div>
          <h2 className="text-xl font-bold text-white mb-1">
            {uploadStage === 'getting_url' && 'Preparing upload…'}
            {uploadStage === 'uploading' && 'Uploading scan…'}
            {uploadStage === 'saving' && 'Saving your results…'}
          </h2>
          <p className="text-slate-400 text-sm">
            {uploadStage === 'uploading'
              ? 'Sending your scan to Prism for processing'
              : 'This will only take a moment'}
          </p>
        </div>

        {/* Progress bar — only during upload */}
        {uploadStage === 'uploading' && (
          <div className="w-full">
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2 text-right">{uploadProgress}%</p>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Error overlay ───────────────────────────────────────────────────────────
  const errorOverlay = uploadStage === 'error' && error && (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-slate-900/95">
      <div className="text-center p-8 max-w-sm">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-white font-semibold mb-2">Something went wrong</p>
        <p className="text-slate-400 text-sm mb-6">{error}</p>
        <button onClick={onClose} className="px-8 py-3 bg-white text-black rounded-xl font-bold">
          Close
        </button>
      </div>
    </div>
  );

  // ─── Initial ready overlay ───────────────────────────────────────────────────
  const readyOverlay = uploadStage === 'idle' && !error && (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-xl">
      <div className="flex flex-col items-center p-8 text-center max-w-sm mx-auto">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-emerald-500/20">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Initializing Scanner</h2>
        <p className="text-slate-400 text-sm mb-6">Setting up your scan session…</p>
        <button onClick={onClose} className="text-zinc-500 text-sm hover:text-zinc-300">
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex items-center justify-center overflow-hidden">

      {/* Prism SDK render target */}
      <div
        id="prism-container"
        ref={containerRef}
        className="absolute inset-0 w-full h-full z-0"
        style={{ backgroundColor: 'transparent' }}
      />

      {/* Debug log — remove or hide in production */}
      <div className="absolute top-4 left-4 right-4 bg-black/90 text-xs font-mono p-3 rounded-2xl z-[300] max-h-40 overflow-auto border border-emerald-400">
        <div className="text-emerald-400 mb-1 font-bold">DEBUG LOG</div>
        {debugLog.map((line, i) => (
          <div key={i} className="text-emerald-100 py-px text-[10px]">{line}</div>
        ))}
      </div>

      {readyOverlay}
      {uploadOverlay}
      {errorOverlay}
    </div>
  );
};