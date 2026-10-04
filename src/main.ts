import './styles.css';
import { App } from './app/App';

// Ask for the canvas font early; the game renders with a fallback until it arrives.
void document.fonts?.load("700 32px 'Fredoka'").catch(() => undefined);

const app = new App();
app.start();

// Development-only handle for debugging in the browser console / automated play-testing.
if (import.meta.env.DEV) (window as unknown as { __snack: App }).__snack = app;
