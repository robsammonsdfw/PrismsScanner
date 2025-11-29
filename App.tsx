import React, { useState } from 'react';
import { Scanner } from './components/Scanner';
import { 
  Scan, 
  Smartphone, 
  ShieldCheck, 
  ChevronRight, 
  Activity, 
  Home, 
  CalendarPlus, 
  Utensils, 
  History, 
  Lightbulb, 
  ClipboardList, 
  Star, 
  LogOut 
} from 'lucide-react';

enum AppState {
  LANDING,
  SCANNING,
  COMPLETED,
  // Placeholders for other nav items to demonstrate navigation
  PLACEHOLDER_VIEW
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.LANDING);
  const [scanData, setScanData] = useState<any>(null);
  const [activeNav, setActiveNav] = useState<string>('Home');

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

  const navigateTo = (navItem: string) => {
    setActiveNav(navItem);
    if (navItem === 'Home') {
      setAppState(AppState.LANDING);
    } else {
      // For now, other tabs just show a placeholder
      setAppState(AppState.PLACEHOLDER_VIEW);
    }
  };

  const NavItem = ({ name, icon: Icon, active }: { name: string; icon: any; active: boolean }) => (
    <button 
      onClick={() => navigateTo(name)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
        active 
          ? 'bg-zinc-800 text-white' 
          : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden lg:inline">{name}</span>
    </button>
  );

  // --- RENDER HELPERS ---

  // Shared Header Component
  const renderHeader = () => (
    <header className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 sticky top-0 z-40">
      {/* Left: Logo */}
      <div 
        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" 
        onClick={() => navigateTo('Home')}
      >
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <span className="font-bold text-lg tracking-tight text-white hidden sm:block">EmbraceHealth AI</span>
      </div>

      {/* Middle: Navigation */}
      <nav className="flex items-center gap-1 md:gap-2">
        <NavItem name="Home" icon={Home} active={activeNav === 'Home'} />
        <NavItem name="Plan" icon={CalendarPlus} active={activeNav === 'Plan'} />
        <NavItem name="Meals" icon={Utensils} active={activeNav === 'Meals'} />
        <NavItem name="History" icon={History} active={activeNav === 'History'} />
        <NavItem name="Ideas" icon={Lightbulb} active={activeNav === 'Ideas'} />
        <NavItem name="List" icon={ClipboardList} active={activeNav === 'List'} />
        <NavItem name="Rewards" icon={Star} active={activeNav === 'Rewards'} />
      </nav>

      {/* Right: Logout */}
      <button className="text-zinc-400 hover:text-white text-sm hidden sm:flex items-center gap-2">
        <LogOut className="w-4 h-4" />
        <span>Logout</span>
      </button>
    </header>
  );

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
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
      {renderHeader()}

      <main className="flex-1 flex flex-col relative">
        {/* LANDING VIEW */}
        {appState === AppState.LANDING && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full animate-in fade-in duration-500">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 rounded-full"></div>
              <Smartphone className="w-24 h-24 text-zinc-200 relative z-10" />
            </div>

            <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Your Health Journey Starts Here
            </h1>
            
            <p className="text-zinc-400 mb-8 leading-relaxed">
              3D bodyscan to get your full health report with current health recommendations.
            </p>

            <div className="space-y-4 w-full">
              <button 
                onClick={startScan}
                className="w-full group relative bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
              >
                Start 3D Scan
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>

              <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 mt-4">
                <ShieldCheck className="w-4 h-4" />
                <span>Your data is encrypted & secure</span>
              </div>
            </div>
          </div>
        )}

        {/* COMPLETED VIEW */}
        {appState === AppState.COMPLETED && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
              <ShieldCheck className="w-10 h-10 text-green-500" />
            </div>
            
            <h2 className="text-3xl font-bold mb-4">Scan Complete!</h2>
            <p className="text-zinc-400 mb-8 max-w-xs mx-auto">
              We have successfully captured your measurements. Generating your body composition report and BMI analysis now.
            </p>

            <div className="bg-zinc-900 p-4 rounded-lg w-full max-w-sm text-left mb-8 border border-zinc-800">
              <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Debug Info</h4>
              <pre className="text-xs text-zinc-300 overflow-x-auto">
                {JSON.stringify(scanData || { status: 'success' }, null, 2)}
              </pre>
            </div>

            <button 
              onClick={handleCloseScanner}
              className="w-full max-w-xs bg-white text-black font-semibold py-4 px-6 rounded-xl hover:bg-zinc-200 transition-colors"
            >
              Scan Again
            </button>
          </div>
        )}

        {/* PLACEHOLDER FOR OTHER TABS */}
        {appState === AppState.PLACEHOLDER_VIEW && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
              <Activity className="w-8 h-8 opacity-50" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-300 mb-2">{activeNav}</h2>
            <p>This section is under development.</p>
            <button 
              onClick={() => navigateTo('Home')}
              className="mt-6 text-blue-400 hover:text-blue-300 text-sm hover:underline"
            >
              Return to Scanner
            </button>
          </div>
        )}
      </main>

      {/* Footer Instructions (Only show on Landing) */}
      {appState === AppState.LANDING && (
        <div className="bg-zinc-900/50 p-6 border-t border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Before you start</h3>
          <ul className="space-y-3 text-sm text-zinc-400">
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">1</span>
              Find a well-lit room with some space.
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">2</span>
              Wear tight-fitting clothes.
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">3</span>
              Prop your phone vertically against a wall.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default App;