import React, { useState, useEffect } from 'react';
import { Scanner } from './components/Scanner';
import { Navbar } from './components/Navbar';
import { HealthReport } from './components/HealthReport';
import { OnboardingGoals } from './components/OnboardingGoals';
import { DigitalTwinIntro } from './components/DigitalTwinIntro';
import { Dashboard } from './components/Dashboard';
import { saveBodyScan, checkAuthToken, setAuthToken } from './services/api';
import { ScanHistory } from './components/ScanHistory';
import { 
  Smartphone, 
  ShieldCheck, 
  ChevronRight,
  Loader2
} from 'lucide-react';

enum AppState {
  CHECKING_AUTH,
  LANDING,
  ONBOARDING_GOALS,
  ONBOARDING_INTRO,
  SCANNING,
  SAVING,
  DASHBOARD,
  SCAN_HISTORY,
  REPORT
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.CHECKING_AUTH);
  const [scanData, setScanData] = useState<any>(null);
  const [userGoal, setUserGoal] = useState<string>('');

  useEffect(() => {
    // 1. SSO Check: Look for token in URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const ssoToken = urlParams.get('token');

    if (ssoToken) {
        // Save the token from the URL to this app's local storage
        setAuthToken(ssoToken);
        // Remove the token from the URL to keep it clean and secure
        window.history.replaceState({}, document.title, window.location.pathname);
        setAppState(AppState.LANDING);
    } else if (checkAuthToken()) {
        // 2. If already logged in locally
        setAppState(AppState.LANDING);
    } else {
        // 3. Not logged in, redirect to Main App
        // Ensure this URL matches your main app's address exactly
        window.location.href = 'https://app.embracehealth.ai';
    }
  }, []);

  // --- ACTIONS ---

  const startOnboarding = () => {
    setAppState(AppState.ONBOARDING_GOALS);
  };

  const handleGoalSelected = (goal: string) => {
    setUserGoal(goal);
    setAppState(AppState.ONBOARDING_INTRO);
  };

  const startScanFromIntro = () => {
    setAppState(AppState.SCANNING);
  };

  const handleScanComplete = async (data: any) => {
    // 1. Show saving state
    setAppState(AppState.SAVING);
    
    // Extract ID safely. The Prism SDK 'data' usually contains the ID or the object itself is the ID context.
    // We send { scanId, userGoal } to backend so backend can fetch Metrics/FutureMe from Prism.
    const scanId = data.id || data._id || (typeof data === 'string' ? data : null);
    
    const payload = { 
        scanId: scanId,
        userGoal: userGoal,
        raw: data // Keep raw just in case
    };

    try {
        // 2. Save to backend (Backend will fetch Metrics from Prism)
        const savedRecord = await saveBodyScan(payload);
        
        // 3. Update state with the rich record returned from DB (measurements, composition, etc)
        setScanData(savedRecord);
        setAppState(AppState.DASHBOARD);
    } catch (err) {
        console.error("Failed to save scan to database", err);
        // Fallback: Show dashboard with local data even if save failed
        setScanData({ scan_data: data }); 
        setAppState(AppState.DASHBOARD);
    }
  };

  const handleCloseScanner = () => {
    setAppState(AppState.LANDING);
  };

  const goToReport = () => {
    setAppState(AppState.REPORT);
  };

  const backToDashboard = () => {
    setAppState(AppState.DASHBOARD);
  };

  // --- VIEW ROUTING ---
  
  if (appState === AppState.CHECKING_AUTH) {
      return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-emerald-500"/></div>;
  }

  // 1. ONBOARDING: GOALS
  if (appState === AppState.ONBOARDING_GOALS) {
    return (
      <OnboardingGoals 
        onNext={handleGoalSelected}
        onBack={() => setAppState(AppState.LANDING)}
      />
    );
  }

  // 2. ONBOARDING: DIGITAL TWIN INTRO
  if (appState === AppState.ONBOARDING_INTRO) {
    return (
      <DigitalTwinIntro 
        onStartScan={startScanFromIntro} 
      />
    );
  }

  // 3. SCANNER (Full Screen)
  if (appState === AppState.SCANNING) {
    return (
      <Scanner 
        onClose={handleCloseScanner} 
        onComplete={handleScanComplete} 
      />
    );
  }
  
  // 4. SAVING STATE
  if (appState === AppState.SAVING) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white z-50">
            <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
            <p className="text-lg font-medium">Processing health metrics...</p>
        </div>
      );
  }

  // 4.5 GET SCAN HISTORY LIST
  if (appState === AppState.SCAN_HISTORY) {
    return <ScanHistory />;
  }
  
  // 5. DASHBOARD (Post-Scan Home)
  if (appState === AppState.DASHBOARD) {
    return (
      <Dashboard 
        data={scanData}
        onViewReport={goToReport}
      />
    );
  }

  // 6. DETAILED REPORT
  if (appState === AppState.REPORT) {
    return (
      <HealthReport 
        onBack={backToDashboard} 
        results={scanData}
      />
    );
  }

  // 7. LANDING VIEW (Main Entry)
  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-800 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 flex flex-col relative">
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
              onClick={startOnboarding}
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
      </main>

      {/* Footer Instructions (Only show on Landing) */}
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
    </div>
  );
};

export default App;