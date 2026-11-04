// The game's font ships with the app: no requests to font services (children's privacy, offline play).
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './styles.css';
import { App } from './app/App';

// Ask for the canvas font early; the game renders with a fallback until it arrives.
void document.fonts?.load("700 32px 'Fredoka'").catch(() => undefined);

const app = new App();
app.start();

// Published builds work offline once opened (see public/sw.js). Not in development, where it
// would serve stale files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
  });
}

// Development-only handle for debugging in the browser console / automated play-testing.
if (import.meta.env.DEV) (window as unknown as { __snack: App }).__snack = app;
