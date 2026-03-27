import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApp } from './Backend/server';
import { startSupervisor } from './Backend/services/supervisorController';
import { startBybitSupervisor } from './Backend/bybit/services/bybitSupervisorController';
import { startWooRealSupervisor } from './Backend/woo_real/services/wooRealSupervisorController';
import { BYBIT_ENABLED } from './Backend/bybit/config';
import { WOO_REAL_ENABLED } from './Backend/woo_real/config';
import { TELEMETRY_ROOT } from './Backend/utils/config';

function envTrue(v: string | undefined): boolean {
  const raw = (v ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

async function startServer() {
  const app = createApp({ serveFrontend: false });
  const PORT = parseInt(process.env.PORT || '3000', 10);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      configFile: path.join(process.cwd(), 'vite.config.ts')
    });
    app.use(vite.middlewares);
  } else {
    const frontendDist = path.join(process.cwd(), 'Frontend', 'dist');
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`TELEMETRY_ROOT=${TELEMETRY_ROOT}`);
    console.log('API: /api/health | /api/trading/live/supervisor/ping | status | start | stop | restart/:agentId');
    setTimeout(() => {
      startSupervisor().catch((err) => console.error('Supervisor start:', err));
      if (envTrue(process.env.AUTO_START_EXCHANGE_SUPERVISORS)) {
        if (BYBIT_ENABLED) {
          startBybitSupervisor().catch((err) =>
            console.error('Bybit supervisor auto-start:', err)
          );
        }
        if (WOO_REAL_ENABLED) {
          startWooRealSupervisor().catch((err) =>
            console.error('WOO Real supervisor auto-start:', err)
          );
        }
      }
    }, 1000);
  });
}

startServer();
