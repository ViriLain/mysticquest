import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devShutdownPlugin()],
})
