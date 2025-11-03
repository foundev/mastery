import './style.css';
import { initApp } from './app';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initApp(), { once: true });
} else {
  initApp();
}
