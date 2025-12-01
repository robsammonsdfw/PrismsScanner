import React from 'react';
import { User, ChevronRight, Share2, Settings } from 'lucide-react';

interface Props {
  data: any;
  onViewReport: () => void;
}

export const Dashboard: React.FC<Props> = ({ data, onViewReport }) => {
  // Safe extraction with default values
  const comp = data?.scan_data?.composition || {};
  const bodyFat = comp.bodyFatPercentage ? comp.bodyFatPercentage.toFixed(1) : "18.5";
  const weight = comp.weight ? comp.weight.replace(' lbs', '') : "---"; 
  
  // Calculate stroke offsets for rings (CSS based)
  // Ring 1 (Outer)
  const r1 = 120;
  const c1 = 2 * Math.PI * r1;
  const bfPct = 35; // Mock data for visualization
  const bfOffset = c1 - (bfPct / 100) * c1;

  // Ring 2 (Inner)
  const r2 = 95;
  const c2 = 2 * Math.PI * r2;
  const wPct = 65; // Mock data for visualization
  const wOffset = c2 - (wPct / 100) * c2;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
        {/* Header */}
        <div className="px-6 pt-12 pb-2 flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Welcome,</h1>
                <p className="text-slate-500 text-lg">Here's your baseline.</p>
            </div>
            <div className="flex gap-4">
                <button className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-emerald-500"><Share2 className="w-5 h-5"/></button>
                <button className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-slate-600"><Settings className="w-5 h-5"/></button>
            </div>
        </div>

        {/* Central Visualization: Twin + Rings */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
            
            {/* The Rings Container */}
            <div className="relative w-[320px] h-[320px] flex items-center justify-center">
                {/* SVG Rings */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                     {/* Track 1 */}
                    <circle cx="160" cy="160" r={r1} fill="none" stroke="#e2e8f0" strokeWidth="16" strokeLinecap="round" opacity="0.3" />
                    {/* Ring 1: Body Fat (Emerald) */}
                    <circle 
                        cx="160" cy="160" r={r1} 
                        fill="none" 
                        stroke="#10b981" 
                        strokeWidth="16" 
                        strokeLinecap="round"
                        strokeDasharray={c1}
                        strokeDashoffset={bfOffset}
                        className="transition-all duration-1000 ease-out"
                    />

                    {/* Track 2 */}
                    <circle cx="160" cy="160" r={r2} fill="none" stroke="#e2e8f0" strokeWidth="16" strokeLinecap="round" opacity="0.3" />
                    {/* Ring 2: Weight (Blue) */}
                    <circle 
                        cx="160" cy="160" r={r2} 
                        fill="none" 
                        stroke="#3b82f6" 
                        strokeWidth="16" 
                        strokeLinecap="round"
                        strokeDasharray={c2}
                        strokeDashoffset={wOffset}
                        className="transition-all duration-1000 ease-out delay-150"
                    />
                </svg>

                {/* Center Avatar */}
                <div className="absolute inset-0 flex items-center justify-center z-10">
                    <User className="w-32 h-32 text-slate-400" strokeWidth={1.5} />
                </div>
                
                {/* Floating Metric Badge 1 */}
                <div className="absolute top-0 right-8 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.1)] rounded-2xl p-3 flex flex-col items-center border border-emerald-50 animate-in zoom-in delay-300">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Body Fat</span>
                    <span className="text-xl font-bold text-emerald-600">{bodyFat}%</span>
                </div>

                {/* Floating Metric Badge 2 */}
                <div className="absolute bottom-8 left-4 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.1)] rounded-2xl p-3 flex flex-col items-center border border-blue-50 animate-in zoom-in delay-500">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Weight</span>
                    <span className="text-xl font-bold text-blue-600">{weight}</span>
                </div>
            </div>

            <div className="mt-8 px-8 text-center max-w-xs mx-auto">
                 <p className="text-slate-400 text-sm">Your digital twin is live. The rings visualize your key health metrics.</p>
            </div>
        </div>

        {/* Bottom CTA */}
        <div className="p-6 bg-white">
            <button 
                onClick={onViewReport}
                className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-between px-8 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
            >
                <span className="text-lg">View Full Report</span>
                <ChevronRight className="w-6 h-6 text-slate-400" />
            </button>
        </div>
    </div>
  );
};