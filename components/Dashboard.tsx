
import React, { useEffect, useState } from 'react';
import { User, ChevronRight, Share2, Settings, ArrowUpRight } from 'lucide-react';

interface Props {
  data: any;
  onViewReport: () => void;
}

export const Dashboard: React.FC<Props> = ({ data, onViewReport }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Safe extraction
  const comp = data?.scan_data?.composition || {};
  const bodyFat = comp.bodyFatPercentage ? comp.bodyFatPercentage.toFixed(1) : "18.5";
  const weightVal = comp.weight ? comp.weight.toString().replace(' lbs', '') : "---"; 
  
  // Ring Visuals
  const r1 = 120;
  const c1 = 2 * Math.PI * r1;
  const bfPct = Math.min(parseFloat(bodyFat) * 2, 90); // Scale for visual impact
  const bfOffset = isLoaded ? c1 - (bfPct / 100) * c1 : c1;

  const r2 = 95;
  const c2 = 2 * Math.PI * r2;
  const wPct = 65; 
  const wOffset = isLoaded ? c2 - (wPct / 100) * c2 : c2;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col overflow-hidden">
        {/* Header */}
        <header className="px-6 pt-12 pb-2 flex justify-between items-start animate-in fade-in slide-in-from-top-4 duration-700">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Health Profile</h1>
                <p className="text-slate-500 text-lg">Your 3D body analysis.</p>
            </div>
            <div className="flex gap-3">
                <button className="p-3 bg-white rounded-2xl shadow-sm text-slate-400 hover:text-emerald-500 transition-all border border-slate-100"><Share2 className="w-5 h-5"/></button>
                <button className="p-3 bg-white rounded-2xl shadow-sm text-slate-400 hover:text-slate-600 transition-all border border-slate-100"><Settings className="w-5 h-5"/></button>
            </div>
        </header>

        {/* Central Visualization */}
        <main className="flex-1 flex flex-col items-center justify-center relative py-12">
            <div className="relative w-[340px] h-[340px] flex items-center justify-center">
                {/* SVG Rings */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <defs>
                        <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                    </defs>
                    <circle cx="170" cy="170" r={r1} fill="none" stroke="#e2e8f0" strokeWidth="18" opacity="0.4" />
                    <circle 
                        cx="170" cy="170" r={r1} 
                        fill="none" 
                        stroke="url(#emeraldGrad)" 
                        strokeWidth="18" 
                        strokeLinecap="round"
                        strokeDasharray={c1}
                        strokeDashoffset={bfOffset}
                        className="transition-all duration-1000 ease-out"
                    />

                    <circle cx="170" cy="170" r={r2} fill="none" stroke="#e2e8f0" strokeWidth="18" opacity="0.4" />
                    <circle 
                        cx="170" cy="170" r={r2} 
                        fill="none" 
                        stroke="#3b82f6" 
                        strokeWidth="18" 
                        strokeLinecap="round"
                        strokeDasharray={c2}
                        strokeDashoffset={wOffset}
                        className="transition-all duration-1000 ease-out delay-300"
                    />
                </svg>

                {/* Center Avatar */}
                <div className="absolute inset-0 flex items-center justify-center z-10 animate-pulse duration-[3000ms]">
                    <User className="w-36 h-36 text-slate-300" strokeWidth={1} />
                </div>
                
                {/* Metric Badges */}
                <div className={`absolute top-0 right-4 bg-white shadow-xl shadow-emerald-500/10 rounded-3xl p-4 flex flex-col items-center border border-emerald-50 transition-all duration-700 delay-500 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Body Fat</span>
                    <span className="text-2xl font-black text-emerald-600">{bodyFat}%</span>
                </div>

                <div className={`absolute bottom-8 left-0 bg-white shadow-xl shadow-blue-500/10 rounded-3xl p-4 flex flex-col items-center border border-blue-50 transition-all duration-700 delay-700 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Weight</span>
                    <span className="text-2xl font-black text-blue-600">{weightVal} <small className="text-sm font-medium">lbs</small></span>
                </div>
            </div>

            <div className="mt-12 px-8 text-center max-w-xs mx-auto animate-in fade-in duration-1000 delay-1000">
                 <p className="text-slate-400 text-sm leading-relaxed">
                    Your digital twin is active. Metrics update automatically after each scan.
                 </p>
            </div>
        </main>

        {/* Bottom CTA */}
        <footer className="p-6 bg-white border-t border-slate-100 animate-in slide-in-from-bottom-6 duration-500 delay-700">
            <button 
                onClick={onViewReport}
                className="w-full py-5 bg-slate-900 text-white rounded-3xl font-bold flex items-center justify-between px-8 hover:bg-slate-800 active:scale-[0.98] transition-all shadow-2xl shadow-slate-300 group"
            >
                <div className="flex flex-col items-start">
                    <span className="text-lg">Detailed Report</span>
                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Post-Scan Analysis</span>
                </div>
                <ArrowUpRight className="w-6 h-6 text-emerald-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </button>
        </footer>
    </div>
  );
};
