'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import Dashboard from '@/components/Dashboard';
import TrainingModule from '@/components/TrainingModule';
import SchoolModule from '@/components/SchoolModule';
import NotesModule from '@/components/NotesModule';

type ViewType = 'dashboard' | 'training' | 'school' | 'notes';

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove('light-mode');
      document.body.classList.remove('light-mode');
    } else {
      document.documentElement.classList.add('light-mode');
      document.body.classList.add('light-mode');
    }
  }, [isDark]);

  return (
    <main className="min-h-screen bg-slate-900 dark:bg-slate-900 light-mode:bg-slate-50 flex flex-col">
      <div className="flex-1 overflow-y-auto pb-24">
        {currentView === 'dashboard' && <Dashboard onNavigate={setCurrentView} />}
        {currentView === 'training' && <TrainingModule onBack={() => setCurrentView('dashboard')} />}
        {currentView === 'school' && <SchoolModule onBack={() => setCurrentView('dashboard')} />}
        {currentView === 'notes' && <NotesModule onBack={() => setCurrentView('dashboard')} />}
      </div>

      <Navigation
        currentView={currentView}
        onNavigate={setCurrentView}
        isDark={isDark}
        onThemeToggle={() => setIsDark(!isDark)}
      />
    </main>
  );
}
