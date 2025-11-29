import React, { useState } from 'react';
import { Scanner } from './components/Scanner';
import { Navbar } from './components/Navbar';
import { 
  Smartphone, 
  ShieldCheck, 
  ChevronRight, 
  Activity
} from 'lucide-react';

enum AppState {
  LANDING,
  SCANNING,
  COMPLETED
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.LANDING);
  const [scanData, setScanData] = useState<any>(null);

  const startScan = () => {
    setAppState(AppState.SCANNING);
  };

  const handleScanComplete = (data: any) => {
    setScanData(data);
    setAppState(AppState.COMPLETED);
  };

  const handleCloseScanner = () => {
    setAppState(AppState.LANDING);
  };

  // --- VIEW ROUTING ---

  // 1. SCANNER (Full Screen)
  if (appState === AppState.SCANNING) {
    return (
      <Scanner 
        onClose={handleCloseScanner} 
        onComplete={handleScanComplete} 
      />
    );
  }

  // 2. MAIN LAYOUT (Header + Content)
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

        {/* COMPLETED VIEW */}
        {appState === AppState.COMPLETED && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
              <ShieldCheck className="w-10 h-10 text-emerald-600" />
            </div>
            
            <h2 className="text-3xl font-bold mb-4 text-slate-800">Scan Complete!</h2>
            <p className="text-slate-600 mb-8 max-w-xs mx-auto">
              We have successfully captured your measurements. Generating your body composition report and BMI analysis now.
            </p>

            <div className="bg-white p-4 rounded-lg w-full max-w-sm text-left mb-8 border border-slate-200 shadow-sm">
              <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-2">Debug Info</h4>
              <pre className="text-xs text-slate-600 overflow-x-auto bg-slate-50 p-2 rounded">
                {JSON.stringify(scanData || { status: 'success' }, null, 2)}
              </pre>
            </div>

            <button 
              onClick={handleCloseScanner}
              className="w-full max-w-xs bg-slate-800 text-white font-semibold py-4 px-6 rounded-xl hover:bg-slate-700 transition-colors shadow-md"
            >
              Scan Again
            </button>
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