import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

/**
 * Dev-only middleware: lets the in-game QUIT option stop `npm run dev` from
 * the browser. Production builds never see this — `apply: 'serve'` skips it
 * for `vite build`.
 */
function devShutdownPlugin(): Plugin {
  return {
    name: 'dev-shutdown',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shutdown', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('shutting down');
        // Let the HTTP response flush before killing the process.
        setTimeout(() => {
          server.close().finally(() => process.exit(0));
        }, 50);
      });
    },
  };
}

// GitHub Pages serves the site under /<repo>/. Override via VITE_BASE for
// custom domains or other hosts (e.g. VITE_BASE=/ for root-served deploys).
const base = process.env.VITE_BASE ?? '/mysticquest/';

// https://vite.dev/config/
export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), devShutdownPlugin()],
})
