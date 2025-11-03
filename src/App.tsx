import React, { useState, useEffect, useRef } from 'react';
import { useGoals } from './hooks/useGoals';
import { AddGoalModal } from './components/AddGoalModal';
import { GoalList } from './components/GoalList';
import { TimeSession } from './types';
import { storage, exportAll, importAll } from './utils/storage';

const App: React.FC = () => {
  const { goals, addGoal, deleteGoal, startTimer, stopTimer, addManualTime } = useGoals();
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [isAddGoalModalOpen, setIsAddGoalModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = () => {
    const data = exportAll();
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mastery-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleImportFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const proceed = window.confirm('Importing will replace your current data. Continue?');
    if (!proceed) return;
    try {
      const text = await file.text();
      const res = importAll(text);
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      window.alert('Import successful. The app will reload to apply changes.');
      window.location.reload();
    } catch (err) {
      window.alert('Failed to read the selected file');
    }
  };

  useEffect(() => {
    const loadedSessions = storage.getSessions();
    setSessions(loadedSessions);
  }, [goals]);

  return (
    <main className="container">
      <hgroup>
        <h1>Goal Tracker</h1>
        <h2>Track time spent working towards your goals</h2>
      </hgroup>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button className="secondary" onClick={handleExport} aria-label="Export data to JSON">Export JSON</button>
        <button className="secondary" onClick={handleImportClick} aria-label="Import data from JSON">Import JSON</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
      </div>



      <section>
        <GoalList
          goals={goals}
          sessions={sessions}
          onStartTimer={startTimer}
          onStopTimer={stopTimer}
          onDeleteGoal={deleteGoal}
          onAddManualTime={addManualTime}
        />
      </section>

      <AddGoalModal
        isOpen={isAddGoalModalOpen}
        onClose={() => setIsAddGoalModalOpen(false)}
        onAddGoal={addGoal}
      />

      {/* Floating Action Button */}
      <button
        onClick={() => setIsAddGoalModalOpen(true)}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'var(--primary)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '24px',
          fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          transition: 'all 0.2s ease',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        }}
        title="Add New Goal"
        aria-label="Add New Goal"
      >
        +
      </button>
    </main>
  );
};

export default App;