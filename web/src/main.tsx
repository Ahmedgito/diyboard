import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/space-grotesk';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

// Debug/perf switches, e.g. /?aurora=0&motion=0&tick=0
const params = new URLSearchParams(location.search);
for (const key of ['aurora', 'motion', 'tick']) {
  const v = params.get(key);
  if (v !== null) document.documentElement.dataset[key] = v;
}

createRoot(document.getElementById('root')!).render(<App />);
