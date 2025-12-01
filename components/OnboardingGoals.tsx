import React from 'react';
import { Target, Dumbbell, Activity, ChevronRight } from 'lucide-react';

interface Props {
  onNext: (goal: string) => void;
  onBack: () => void;
}

export const OnboardingGoals: React.FC<Props> = ({ onNext, onBack }) => {
  const goals = [
    { id: 'weight_loss', label: 'Lose Weight', icon: Target },
    { id: 'muscle_gain', label: 'Build Muscle', icon: Dumbbell },
    { id: 'maintenance', label: 'Maintain Health', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col p-6 animate-in fade-in slide-in-from-right-10 duration-500">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <h1 className="text-3xl font-extrabold mb-2 text-slate-900">What is your goal?</h1>
        <p className="text-slate-500 mb-8">Select your primary health objective so we can personalize your analysis.</p>

        <div className="space-y-4">
          {goals.map((goal) => (
            <button
              key={goal.id}
              onClick={() => onNext(goal.id)}
              className="w-full flex items-center justify-between p-5 bg-white border border-slate-200 rounded-xl hover:border-emerald-500 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                  <goal.icon className="w-5 h-5" />
                </div>
                <span className="font-semibold text-slate-700 text-lg">{goal.label}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-500" />
            </button>
          ))}
        </div>
      </div>
      
      <button onClick={onBack} className="text-slate-400 text-sm font-medium p-4 hover:text-slate-600">
        Go Back
      </button>
    </div>
  );
};