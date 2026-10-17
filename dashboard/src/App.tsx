import { useEffect } from 'react';
import { KpiStrip } from './components/KpiStrip';
import { PatientTable } from './components/PatientTable';
import { TopBar } from './components/TopBar';
import { store } from './store/vitalStore';
import { createStream } from './stream/createStream';

export default function App() {
  useEffect(() => {
    store.attach(createStream());
    return () => store.detach();
  }, []);

  return (
    <div className="app">
      <TopBar />
      <KpiStrip />
      <PatientTable />
      <footer className="foot">Demo data · simplified NEWS2 · not for clinical use</footer>
    </div>
  );
}
