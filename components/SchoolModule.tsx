'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, CheckCircle2, Circle, Trash2, Calendar, Clock, AlertCircle } from 'lucide-react';
import { getLocalStorage, setLocalStorage } from '@/lib/storage';

interface Task {
  id: string;
  title: string;
  subject: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  notes?: string;
}

interface ScheduleEntry {
  id: string;
  time: string;
  subject: string;
  room?: string;
  day: string;
}

interface SchoolModuleProps {
  onBack: () => void;
}

const priorityColors = {
  low: 'from-green-600 to-green-700',
  medium: 'from-orange-600 to-orange-700',
  high: 'from-red-600 to-red-700',
};

export default function SchoolModule({ onBack }: SchoolModuleProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'tasks' | 'schedule'>('tasks');
  const [newTask, setNewTask] = useState({
    title: '',
    subject: '',
    dueDate: '',
    priority: 'medium' as const,
  });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const savedTasks = getLocalStorage('schoolTasks');
    const savedSchedule = getLocalStorage('schoolSchedule');
    if (savedTasks) setTasks(savedTasks);
    if (savedSchedule) setSchedule(savedSchedule);
  }, []);

  const saveTasks = (updatedTasks: Task[]) => {
    setLocalStorage('schoolTasks', updatedTasks);
    setTasks(updatedTasks);
  };

  const handleAddTask = () => {
    if (!newTask.title || !newTask.dueDate) return;

    const task: Task = {
      id: Date.now().toString(),
      title: newTask.title,
      subject: newTask.subject || 'Allgemein',
      dueDate: newTask.dueDate,
      priority: newTask.priority,
      completed: false,
    };

    saveTasks([...tasks, task]);
    setNewTask({ title: '', subject: '', dueDate: '', priority: 'medium' });
    setShowForm(false);
  };

  const toggleCompletion = (id: string) => {
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const deleteTask = (id: string) => {
    saveTasks(tasks.filter((t) => t.id !== id));
  };

  const sortedTasks = [...tasks].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  const today = new Date().toDateString();
  const todaysTasks = sortedTasks.filter((t) => {
    const taskDate = new Date(t.dueDate).toDateString();
    return taskDate === today && !t.completed;
  });

  const upcomingTasks = sortedTasks.filter((t) => {
    const taskDate = new Date(t.dueDate).toDateString();
    return taskDate !== today && !t.completed;
  });

  const completedTasks = sortedTasks.filter((t) => t.completed);

  const PriorityIcon = ({ priority }: { priority: string }) => {
    if (priority === 'high') return <AlertCircle size={16} />;
    return <Clock size={16} />;
  };

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
          <h1 className="text-3xl font-bold">Schulorganisation</h1>
          <p className="text-slate-400 light-mode:text-slate-600">Aufgaben & Stundenplan</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 p-3 rounded-lg font-semibold transition-colors min-h-12 ${
            activeTab === 'tasks'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 light-mode:bg-slate-100 text-slate-400 light-mode:text-slate-600'
          }`}
        >
          Aufgaben
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex-1 p-3 rounded-lg font-semibold transition-colors min-h-12 ${
            activeTab === 'schedule'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 light-mode:bg-slate-100 text-slate-400 light-mode:text-slate-600'
          }`}
        >
          Stundenplan
        </button>
      </div>

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <>
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full mb-6 p-4 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold flex items-center justify-center gap-2 min-h-12"
            >
              <Plus size={24} />
              Aufgabe hinzufügen
            </button>
          ) : (
            <div className="mb-6 p-4 rounded-xl bg-slate-800 light-mode:bg-slate-50 border border-slate-700 light-mode:border-slate-200">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Aufgabentitel</label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder="z.B. Mathe Hausaufgaben"
                    className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 min-h-12"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Fach</label>
                    <input
                      type="text"
                      value={newTask.subject}
                      onChange={(e) => setNewTask({ ...newTask, subject: e.target.value })}
                      placeholder="z.B. Mathe"
                      className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 min-h-12"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Fällig bis</label>
                    <input
                      type="date"
                      value={newTask.dueDate}
                      onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                      className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 min-h-12"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Priorität</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        priority: e.target.value as 'low' | 'medium' | 'high',
                      })
                    }
                    className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 min-h-12"
                  >
                    <option value="low">Niedrig</option>
                    <option value="medium">Mittel</option>
                    <option value="high">Hoch</option>
                  </select>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleAddTask}
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

          {/* Today's Tasks */}
          {todaysTasks.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3">Heute fällig</h2>
              <div className="space-y-2">
                {todaysTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`p-4 rounded-xl bg-gradient-to-br ${priorityColors[task.priority]} text-white shadow-lg`}
                  >
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => toggleCompletion(task.id)}
                        className="pt-1 flex-shrink-0 active:scale-90 transition-transform"
                      >
                        <Circle size={28} className="opacity-60" />
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <PriorityIcon priority={task.priority} />
                          <h3 className="font-semibold">{task.title}</h3>
                        </div>
                        <p className="text-sm opacity-80 mt-1">{task.subject}</p>
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-2 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Tasks */}
          {upcomingTasks.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3">Zukünftige Aufgaben</h2>
              <div className="space-y-2">
                {upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`p-4 rounded-xl bg-gradient-to-br ${priorityColors[task.priority]} text-white shadow-lg opacity-75`}
                  >
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => toggleCompletion(task.id)}
                        className="pt-1 flex-shrink-0 active:scale-90 transition-transform"
                      >
                        <Circle size={28} className="opacity-60" />
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{task.title}</h3>
                        </div>
                        <p className="text-sm opacity-80 mt-1">{task.subject}</p>
                        <p className="text-xs opacity-60 mt-2">
                          {new Date(task.dueDate).toLocaleDateString('de-DE')}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-2 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-3">Erledigt</h2>
              <div className="space-y-2">
                {completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 rounded-xl bg-slate-700 light-mode:bg-slate-200 text-slate-400 light-mode:text-slate-600 opacity-60"
                  >
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => toggleCompletion(task.id)}
                        className="pt-1 flex-shrink-0 active:scale-90 transition-transform"
                      >
                        <CheckCircle2 size={28} />
                      </button>
                      <div className="flex-1">
                        <h3 className="font-semibold line-through">{task.title}</h3>
                        <p className="text-sm mt-1">{task.subject}</p>
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-2 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="p-6 rounded-xl bg-slate-800 light-mode:bg-slate-50 border border-slate-700 light-mode:border-slate-200 text-center text-slate-400 light-mode:text-slate-600">
          <Calendar size={32} className="mx-auto mb-3 opacity-50" />
          <p className="font-semibold mb-1">Stundenplan</p>
          <p className="text-sm">Diese Funktion ist für die nächste Version geplant.</p>
        </div>
      )}
    </div>
  );
}
