'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, CheckCircle2, Circle, Trash2, Zap, Dumbbell, Wind, RotateCcw } from 'lucide-react';
import { getLocalStorage, setLocalStorage } from '@/lib/storage';

interface TrainingSession {
  id: string;
  day: string;
  type: 'intervall' | 'kraft' | 'gym' | 'rest';
  title: string;
  completed: boolean;
  date: string;
  notes?: string;
}

interface TrainingModuleProps {
  onBack: () => void;
}

const trainingIcons = {
  intervall: Zap,
  kraft: Wind,
  gym: Dumbbell,
  rest: RotateCcw,
};

const trainingColors = {
  intervall: 'from-orange-600 to-orange-700',
  kraft: 'from-purple-600 to-purple-700',
  gym: 'from-red-600 to-red-700',
  rest: 'from-blue-600 to-blue-700',
};

export default function TrainingModule({ onBack }: TrainingModuleProps) {
  const [trainingSessions, setTrainingSessions] = useState<TrainingSession[]>([]);
  const [newSession, setNewSession] = useState({
    type: 'intervall' as const,
    title: '',
    notes: '',
  });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const saved = getLocalStorage('trainingWeek');
    if (saved) {
      setTrainingSessions(saved);
    }
  }, []);

  const saveSessions = (sessions: TrainingSession[]) => {
    setLocalStorage('trainingWeek', sessions);
    setTrainingSessions(sessions);
  };

  const handleAddSession = () => {
    if (!newSession.title) return;

    const today = new Date();
    const session: TrainingSession = {
      id: Date.now().toString(),
      day: today.toLocaleDateString('de-DE', { weekday: 'short' }),
      type: newSession.type,
      title: newSession.title,
      completed: false,
      date: today.toDateString(),
      notes: newSession.notes,
    };

    saveSessions([...trainingSessions, session]);
    setNewSession({ type: 'intervall', title: '', notes: '' });
    setShowForm(false);
  };

  const toggleCompletion = (id: string) => {
    saveSessions(
      trainingSessions.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s))
    );
  };

  const deleteSession = (id: string) => {
    saveSessions(trainingSessions.filter((s) => s.id !== id));
  };

  const completedCount = trainingSessions.filter((s) => s.completed).length;
  const completionPercentage =
    trainingSessions.length > 0 ? Math.round((completedCount / trainingSessions.length) * 100) : 0;

  return (
    <div className="px-4 pt-6 pb-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="p-3 rounded-lg hover:bg-slate-700 light-mode:hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-3xl font-bold">Trainingsplan</h1>
          <p className="text-slate-400 light-mode:text-slate-600">Offseason Vorbereitung</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-8 p-6 rounded-xl bg-slate-800 light-mode:bg-slate-100">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">Wochenfortschritt</h2>
          <span className="text-2xl font-bold text-blue-400">{completionPercentage}%</span>
        </div>
        <div className="w-full h-3 bg-slate-700 light-mode:bg-slate-300 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
        <p className="text-sm text-slate-400 light-mode:text-slate-600 mt-2">
          {completedCount} von {trainingSessions.length} abgeschlossen
        </p>
      </div>

      {/* Add Training Button */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mb-6 p-4 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold flex items-center justify-center gap-2 min-h-12"
        >
          <Plus size={24} />
          Trainingseinheit hinzufügen
        </button>
      ) : (
        <div className="mb-6 p-4 rounded-xl bg-slate-800 light-mode:bg-slate-50 border border-slate-700 light-mode:border-slate-200">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Trainingstyp</label>
              <select
                value={newSession.type}
                onChange={(e) =>
                  setNewSession({
                    ...newSession,
                    type: e.target.value as TrainingSession['type'],
                  })
                }
                className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 min-h-12"
              >
                <option value="intervall">Intervalltraining</option>
                <option value="kraft">Krafttraining</option>
                <option value="gym">Fitnessstudio</option>
                <option value="rest">Ruhetag</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Titel</label>
              <input
                type="text"
                value={newSession.title}
                onChange={(e) => setNewSession({ ...newSession, title: e.target.value })}
                placeholder="z.B. 5x3min Sprints"
                className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 min-h-12"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notizen (optional)</label>
              <textarea
                value={newSession.notes}
                onChange={(e) => setNewSession({ ...newSession, notes: e.target.value })}
                placeholder="Zusätzliche Infos..."
                className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 resize-none min-h-24"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddSession}
                className="flex-1 p-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold transition-colors min-h-12"
              >
                Speichern
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 p-3 rounded-lg bg-slate-700 light-mode:bg-slate-200 hover:bg-slate-600 light-mode:hover:bg-slate-300 font-semibold transition-colors min-h-12"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Training List */}
      <div className="space-y-3">
        {trainingSessions.length === 0 ? (
          <div className="p-8 text-center text-slate-400 light-mode:text-slate-600">
            <p>Keine Trainingseinheiten geplant.</p>
            <p className="text-sm mt-2">Starte mit dem Button oben, um eine Einheit hinzuzufügen.</p>
          </div>
        ) : (
          trainingSessions.map((session) => {
            const Icon = trainingIcons[session.type];
            return (
              <div
                key={session.id}
                className={`p-4 rounded-xl bg-gradient-to-br ${trainingColors[session.type]} text-white shadow-lg transition-all ${
                  session.completed ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => toggleCompletion(session.id)}
                    className="pt-1 flex-shrink-0 active:scale-90 transition-transform"
                  >
                    {session.completed ? (
                      <CheckCircle2 size={28} />
                    ) : (
                      <Circle size={28} className="opacity-60" />
                    )}
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Icon size={20} />
                      <h3 className={`font-semibold ${session.completed ? 'line-through' : ''}`}>
                        {session.title}
                      </h3>
                    </div>
                    {session.notes && (
                      <p className="text-sm opacity-80 mt-1">{session.notes}</p>
                    )}
                    <p className="text-xs opacity-60 mt-2">{session.day}</p>
                  </div>

                  <button
                    onClick={() => deleteSession(session.id)}
                    className="p-2 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
