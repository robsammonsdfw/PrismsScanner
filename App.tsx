import React, { useState, useEffect } from 'react';
import { Scanner } from './components/Scanner';
import { Navbar } from './components/Navbar';
import { HealthReport } from './components/HealthReport';
import { saveBodyScan, checkAuthToken, setAuthToken } from './services/api';
import { 
  Smartphone, 
  ShieldCheck, 
  ChevronRight,
  Loader2
} from 'lucide-react';

enum AppState {
  CHECKING_AUTH,
  LANDING,
  SCANNING,
  SAVING,
  COMPLETED
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.CHECKING_AUTH);
  const [scanData, setScanData] = useState<any>(null);

  useEffect(() => {
    // 1. SSO Check: Look for token in URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const ssoToken = urlParams.get('token');

    if (ssoToken) {
        // Save the token from the URL to this app's local storage
        setAuthToken(ssoToken);
        // Remove the token from the URL to keep it clean and secure
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // 2. Verify Authentication
    if (!checkAuthToken()) {
        // Redirect to the main app login if no token is found
        window.location.href = 'https://main.embracehealth.ai';
    } else {
        setAppState(AppState.LANDING);
    }
  }, []);

  const startScan = () => {
    setAppState(AppState.SCANNING);
  };

  const handleScanComplete = async (data: any) => {
    // 1. Show saving state
    setAppState(AppState.SAVING);
    
    try {
        // 2. Save to backend
        const savedRecord = await saveBodyScan(data);
        // 3. Update state with the record returned from DB (includes timestamp/ID)
        setScanData(savedRecord);
        setAppState(AppState.COMPLETED);
    } catch (err) {
        console.error("Failed to save scan to database", err);
        // Fallback: Show report with local data even if save failed, but log error
        setScanData({ scan_data: data }); 
        setAppState(AppState.COMPLETED);
    }
  };

  const handleCloseScanner = () => {
    setAppState(AppState.LANDING);
  };

  // --- VIEW ROUTING ---
  
  if (appState === AppState.CHECKING_AUTH) {
      return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-emerald-500"/></div>;
  }

  // 1. SCANNER (Full Screen)
  if (appState === AppState.SCANNING) {
    return (
      <Scanner 
        onClose={handleCloseScanner} 
        onComplete={handleScanComplete} 
      />
    );
  }
  
  // 2. SAVING STATE
  if (appState === AppState.SAVING) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white z-50">
            <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
            <p className="text-lg font-medium">Saving your health report...</p>
        </div>
      );
  }

  // 3. COMPLETED / REPORT VIEW
  if (appState === AppState.COMPLETED) {
    return (
      <HealthReport 
        onBack={handleCloseScanner} 
        results={scanData}
      />
    );
  }

  // 4. MAIN LAYOUT (Header + Content)
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 flex flex-col relative">
        {/* LANDING VIEW */}
        {appState === AppState.LANDING && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full animate-in fade-in duration-500">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-emerald-200 blur-2xl opacity-40 rounded-full"></div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative z-10">
                <Smartphone className="w-16 h-16 text-emerald-500" />
              </div>
            </div>

            <h1 className="text-3xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-cyan-600">
              Your Health Journey Starts Here
            </h1>
            
            <p className="text-slate-600 mb-8 leading-relaxed">
              3D bodyscan to get your full health report with current health recommendations.
            </p>

            <div className="space-y-4 w-full">
              <button 
                onClick={startScan}
                className="w-full group relative bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transform hover:-translate-y-0.5"
              >
                Start 3D Scan
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>

              <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mt-4">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Your data is encrypted & secure</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Instructions (Only show on Landing) */}
      {appState === AppState.LANDING && (
        <div className="bg-white/80 p-6 border-t border-slate-200 backdrop-blur-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider text-center md:text-left">Before you start</h3>
          <div className="max-w-4xl mx-auto">
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600">
              <li className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 shrink-0">1</span>
                Find a well-lit room with some space.
              </li>
              <li className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 shrink-0">2</span>
                Wear tight-fitting clothes.
              </li>
              <li className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 shrink-0">3</span>
                Prop your phone vertically against a wall.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;