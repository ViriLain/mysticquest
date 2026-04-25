import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { randomUUID } from 'node:crypto'

const DEV_SHUTDOWN_TOKEN = process.env.MYSTICQUEST_DEV_SHUTDOWN_TOKEN || randomUUID();

function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function isDevShutdownAuthorized(url: string | undefined, remoteAddress: string | undefined, expectedToken: string): boolean {
  if (!expectedToken || !isLoopbackAddress(remoteAddress)) return false;
  const token = new URL(url || '/', 'http://localhost').searchParams.get('token');
  return token === expectedToken;
}

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
        if (!isDevShutdownAuthorized(req.url, req.socket.remoteAddress, DEV_SHUTDOWN_TOKEN)) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'text/plain');
          res.end('forbidden');
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
  define: {
    __MYSTICQUEST_DEV_SHUTDOWN_TOKEN__: JSON.stringify(DEV_SHUTDOWN_TOKEN),
  },
})
