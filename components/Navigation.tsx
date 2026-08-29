'use client';

import { Home, Zap, BookOpen, FileText, Moon, Sun } from 'lucide-react';

type ViewType = 'dashboard' | 'training' | 'school' | 'notes';

interface NavigationProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  isDark: boolean;
  onThemeToggle: () => void;
}

export default function Navigation({
  currentView,
  onNavigate,
  isDark,
  onThemeToggle,
}: NavigationProps) {
  const navItems = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'training', label: 'Training', icon: Zap },
    { id: 'school', label: 'Schule', icon: BookOpen },
    { id: 'notes', label: 'Notizen', icon: FileText },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-800 dark:bg-slate-800 light-mode:bg-white border-t border-slate-700 light-mode:border-slate-200 flex items-center justify-between px-safe-left pr-safe-right pb-safe-bottom z-50">
      <div className="flex-1 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as ViewType)}
              className={`flex flex-col items-center justify-center gap-1 px-4 py-3 rounded-lg transition-all min-h-20 min-w-16 ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 light-mode:text-slate-600 hover:text-slate-200 light-mode:hover:text-slate-900'
              }`}
              aria-label={item.label}
            >
              <Icon size={24} strokeWidth={2} />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onThemeToggle}
        className="p-3 rounded-lg text-slate-400 light-mode:text-slate-600 hover:text-slate-200 light-mode:hover:text-slate-900 min-h-20 min-w-16 flex items-center justify-center"
        aria-label="Dunkelmodus umschalten"
      >
        {isDark ? <Sun size={24} /> : <Moon size={24} />}
      </button>
    </nav>
  );
}
