'use client';

import { useEffect, useState } from 'react';
import { Zap, BookOpen, FileText, Calendar, TrendingUp, Clock } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { getLocalStorage, setLocalStorage } from '@/lib/storage';

type ViewType = 'dashboard' | 'training' | 'school' | 'notes';

interface DashboardProps {
  onNavigate: (view: ViewType) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [todaysTasks, setTodaysTasks] = useState(0);
  const [upcomingTraining, setUpcomingTraining] = useState(0);
  const [weekProgress, setWeekProgress] = useState(0);
  const [restDays, setRestDays] = useState(0);

  useEffect(() => {
    const tasks = getLocalStorage('schoolTasks') || [];
    const trainingWeek = getLocalStorage('trainingWeek') || [];
    const today = new Date().toDateString();

    const todaysTaskCount = tasks.filter((t: any) => t.date === today && !t.completed).length;
    setTodaysTasks(todaysTaskCount);

    const completed = trainingWeek.filter((t: any) => t.completed).length;
    setWeekProgress(trainingWeek.length > 0 ? Math.round((completed / trainingWeek.length) * 100) : 0);

    const restDaysCount = trainingWeek.filter((t: any) => t.type === 'rest').length;
    setRestDays(restDaysCount);

    setUpcomingTraining(trainingWeek.filter((t: any) => !t.completed && t.type !== 'rest').length);
  }, []);

  const today = new Date();
  const todayName = today.toLocaleDateString('de-DE', { weekday: 'long' });
  const todayDate = today.toLocaleDateString('de-DE');

  return (
    <div className="px-4 pt-6 pb-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Jarvis</h1>
        <p className="text-slate-400 light-mode:text-slate-600">
          {todayName}, {todayDate}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <DashboardCard
          title="Aufgaben heute"
          value={todaysTasks}
          icon={Calendar}
          onClick={() => onNavigate('school')}
          color="blue"
        />
        <DashboardCard
          title="Training"
          value={upcomingTraining}
          icon={Zap}
          onClick={() => onNavigate('training')}
          color="orange"
        />
        <DashboardCard
          title="Wochenziel"
          value={`${weekProgress}%`}
          icon={TrendingUp}
          onClick={() => onNavigate('training')}
          color="green"
        />
        <DashboardCard
          title="Ruhetage"
          value={restDays}
          icon={Clock}
          onClick={() => onNavigate('training')}
          color="purple"
        />
      </div>

      {/* Feature Cards */}
      <div className="space-y-4">
        <button
          onClick={() => onNavigate('training')}
          className="w-full p-6 rounded-xl bg-gradient-to-br from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white shadow-lg active:scale-95 transition-transform"
        >
          <div className="flex items-center gap-4">
            <Zap size={32} />
            <div className="text-left">
              <h2 className="text-xl font-bold">Trainingsplan</h2>
              <p className="text-orange-100 text-sm">Intervallläufe, Kraft, Gym</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => onNavigate('school')}
          className="w-full p-6 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg active:scale-95 transition-transform"
        >
          <div className="flex items-center gap-4">
            <BookOpen size={32} />
            <div className="text-left">
              <h2 className="text-xl font-bold">Schulorganisation</h2>
              <p className="text-blue-100 text-sm">Stundenplan, Aufgaben, Ferien</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => onNavigate('notes')}
          className="w-full p-6 rounded-xl bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-lg active:scale-95 transition-transform"
        >
          <div className="flex items-center gap-4">
            <FileText size={32} />
            <div className="text-left">
              <h2 className="text-xl font-bold">Notizen & Goodnotes</h2>
              <p className="text-green-100 text-sm">Studiennoten, Fächer-Verknüpfungen</p>
            </div>
          </div>
        </button>
      </div>

      {/* Quick Tip */}
      <div className="mt-8 p-4 rounded-lg bg-slate-800 light-mode:bg-slate-100 border border-slate-700 light-mode:border-slate-200">
        <p className="text-sm text-slate-400 light-mode:text-slate-600">
          💡 <strong>Tipp:</strong> Installiere diese App auf deinem iPad-Startbildschirm für schnellen Zugriff!
          Gehe zu Teilen → Zum Startbildschirm.
        </p>
      </div>
    </div>
  );
}
