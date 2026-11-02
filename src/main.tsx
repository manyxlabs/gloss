import '@fontsource-variable/inter';
import './styles.css';
import './palette';
import './features.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initialTheme } from './components/ThemeToggle';

document.documentElement.dataset.theme = initialTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
