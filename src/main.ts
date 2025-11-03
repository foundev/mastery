import './style.css';
import { initApp } from './app';

const bootstrap = () => {
  initApp();
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const collectCacheableUrls = () => {
      const urls = new Set<string>([
        '/',
        '/index.html',
        '/manifest.webmanifest'
      ]);
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]').forEach((link) => {
        urls.add(link.href);
      });
      document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((script) => {
        urls.add(script.src);
      });
      return Array.from(urls);
    };

    const registerBackgroundSync = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if ('sync' in registration) {
          await registration.sync.register('mastery-sync');
        }
      } catch (error) {
        console.warn('Background sync registration failed:', error);
      }
    };

    const sendCacheList = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: 'CACHE_URLS', payload: collectCacheableUrls() });
      } catch (error) {
        console.warn('Failed to send cacheable asset list to service worker:', error);
      }
    };

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then(() => {
          sendCacheList();
          if (navigator.onLine) {
            registerBackgroundSync();
          }
        })
        .catch((error) => console.error('Service worker registration failed:', error));
    });

    window.addEventListener('online', () => {
      sendCacheList();
      registerBackgroundSync();
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
