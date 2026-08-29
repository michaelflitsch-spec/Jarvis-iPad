'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, ExternalLink, Trash2, FileText, Folder } from 'lucide-react';
import { getLocalStorage, setLocalStorage } from '@/lib/storage';

interface GoodnotesLink {
  id: string;
  name: string;
  subject: string;
  urlScheme: string;
  category: 'document' | 'folder';
  description?: string;
}

interface NotesModuleProps {
  onBack: () => void;
}

const subjectColors: Record<string, string> = {
  Mathe: 'from-blue-600 to-blue-700',
  Deutsch: 'from-green-600 to-green-700',
  Englisch: 'from-orange-600 to-orange-700',
  Geschichte: 'from-purple-600 to-purple-700',
  Biologie: 'from-green-600 to-green-700',
  Chemie: 'from-red-600 to-red-700',
  Physik: 'from-indigo-600 to-indigo-700',
  Sonstiges: 'from-slate-600 to-slate-700',
};

export default function NotesModule({ onBack }: NotesModuleProps) {
  const [links, setLinks] = useState<GoodnotesLink[]>([]);
  const [newLink, setNewLink] = useState({
    name: '',
    subject: 'Sonstiges',
    urlScheme: '',
    category: 'document' as const,
  });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const saved = getLocalStorage('goodnotesLinks');
    if (saved) {
      setLinks(saved);
    } else {
      const defaultLinks: GoodnotesLink[] = [
        {
          id: '1',
          name: 'Mathe Klassiker',
          subject: 'Mathe',
          urlScheme: 'goodnotes://open?uuid=math-classbook',
          category: 'folder',
          description: 'Alle Mathe Noten und Übungen',
        },
        {
          id: '2',
          name: 'Training Log',
          subject: 'Sport',
          urlScheme: 'goodnotes://open?uuid=training-log',
          category: 'document',
          description: 'Trainingsfortschritt und Notizen',
        },
      ];
      setLocalStorage('goodnotesLinks', defaultLinks);
      setLinks(defaultLinks);
    }
  }, []);

  const saveLinks = (updatedLinks: GoodnotesLink[]) => {
    setLocalStorage('goodnotesLinks', updatedLinks);
    setLinks(updatedLinks);
  };

  const handleAddLink = () => {
    if (!newLink.name || !newLink.urlScheme) return;

    const link: GoodnotesLink = {
      id: Date.now().toString(),
      name: newLink.name,
      subject: newLink.subject,
      urlScheme: newLink.urlScheme,
      category: newLink.category,
    };

    saveLinks([...links, link]);
    setNewLink({ name: '', subject: 'Sonstiges', urlScheme: '', category: 'document' });
    setShowForm(false);
  };

  const deleteLink = (id: string) => {
    saveLinks(links.filter((l) => l.id !== id));
  };

  const openGoodnotes = (urlScheme: string) => {
    window.location.href = urlScheme;
  };

  const groupedLinks = links.reduce(
    (acc, link) => {
      if (!acc[link.subject]) acc[link.subject] = [];
      acc[link.subject].push(link);
      return acc;
    },
    {} as Record<string, GoodnotesLink[]>
  );

  const sortedSubjects = Object.keys(groupedLinks).sort();

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
          <h1 className="text-3xl font-bold">Notizen & Goodnotes</h1>
          <p className="text-slate-400 light-mode:text-slate-600">Studiennoten organisieren</p>
        </div>
      </div>

      {/* Info Box */}
      <div className="mb-6 p-4 rounded-xl bg-slate-800 light-mode:bg-slate-50 border border-slate-700 light-mode:border-slate-200">
        <p className="text-sm">
          💡 <strong>Tipp:</strong> Die Goodnotes URL-Schemes müssen in der genauen UUID deiner
          Dokumente übereinstimmen. Öffne ein Dokument in Goodnotes, tippe die UUID aus der URL.
        </p>
      </div>

      {/* Add Link Button */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mb-6 p-4 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold flex items-center justify-center gap-2 min-h-12"
        >
          <Plus size={24} />
          Goodnotes-Link hinzufügen
        </button>
      ) : (
        <div className="mb-6 p-4 rounded-xl bg-slate-800 light-mode:bg-slate-50 border border-slate-700 light-mode:border-slate-200">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Dokumentname</label>
              <input
                type="text"
                value={newLink.name}
                onChange={(e) => setNewLink({ ...newLink, name: e.target.value })}
                placeholder="z.B. Mathe - Kapitel 5"
                className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 min-h-12"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Fach</label>
                <select
                  value={newLink.subject}
                  onChange={(e) => setNewLink({ ...newLink, subject: e.target.value })}
                  className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 min-h-12"
                >
                  <option>Mathe</option>
                  <option>Deutsch</option>
                  <option>Englisch</option>
                  <option>Geschichte</option>
                  <option>Biologie</option>
                  <option>Chemie</option>
                  <option>Physik</option>
                  <option>Sonstiges</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Typ</label>
                <select
                  value={newLink.category}
                  onChange={(e) =>
                    setNewLink({
                      ...newLink,
                      category: e.target.value as 'document' | 'folder',
                    })
                  }
                  className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 min-h-12"
                >
                  <option value="document">Dokument</option>
                  <option value="folder">Ordner</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Goodnotes URL-Scheme</label>
              <input
                type="text"
                value={newLink.urlScheme}
                onChange={(e) => setNewLink({ ...newLink, urlScheme: e.target.value })}
                placeholder="goodnotes://open?uuid=..."
                className="w-full p-3 rounded-lg bg-slate-700 light-mode:bg-white border border-slate-600 light-mode:border-slate-300 focus:outline-none focus:border-blue-500 min-h-12 font-mono text-sm"
              />
              <p className="text-xs text-slate-400 light-mode:text-slate-600 mt-1">
                Format: goodnotes://open?uuid=YOUR_UUID_HERE
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddLink}
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

      {/* Links by Subject */}
      {sortedSubjects.length === 0 ? (
        <div className="p-8 text-center text-slate-400 light-mode:text-slate-600">
          <FileText size={32} className="mx-auto mb-3 opacity-50" />
          <p className="font-semibold">Keine Notizen verlinkt</p>
          <p className="text-sm mt-2">Füge einen Goodnotes-Link hinzu, um zu starten.</p>
        </div>
      ) : (
        sortedSubjects.map((subject) => (
          <div key={subject} className="mb-6">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full bg-gradient-to-br ${
                  subjectColors[subject] || subjectColors.Sonstiges
                }`}
              />
              {subject}
            </h2>
            <div className="space-y-3">
              {groupedLinks[subject].map((link) => {
                const Icon = link.category === 'folder' ? Folder : FileText;
                return (
                  <div
                    key={link.id}
                    className={`p-4 rounded-xl bg-gradient-to-br ${
                      subjectColors[subject] || subjectColors.Sonstiges
                    } text-white shadow-lg`}
                  >
                    <div className="flex items-start gap-4">
                      <Icon size={24} className="mt-1 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-semibold">{link.name}</h3>
                        {link.description && (
                          <p className="text-sm opacity-80 mt-1">{link.description}</p>
                        )}
                        <p className="text-xs opacity-60 mt-2">
                          {link.category === 'folder' ? 'Ordner' : 'Dokument'}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => openGoodnotes(link.urlScheme)}
                          className="p-2 rounded-lg hover:bg-white/20 transition-colors active:scale-90"
                          title="In Goodnotes öffnen"
                        >
                          <ExternalLink size={20} />
                        </button>
                        <button
                          onClick={() => deleteLink(link.id)}
                          className="p-2 rounded-lg hover:bg-white/20 transition-colors active:scale-90"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* How to get UUID */}
      <div className="mt-8 p-4 rounded-xl bg-slate-800 light-mode:bg-slate-50 border border-slate-700 light-mode:border-slate-200">
        <h3 className="font-semibold mb-2">Wie bekomme ich die Goodnotes UUID?</h3>
        <ol className="text-sm space-y-1 text-slate-400 light-mode:text-slate-600">
          <li>1. Öffne das Dokument in Goodnotes</li>
          <li>2. Tippe auf die Teilen-Schaltfläche</li>
          <li>3. Wähle "Link kopieren"</li>
          <li>4. Die UUID ist der lange Code in der URL nach "uuid="</li>
          <li>5. Füge "goodnotes://open?uuid=DEINE_UUID" ein</li>
        </ol>
      </div>
    </div>
  );
}
