# Development

## Start

1. **Backend op 3000** (verplicht voor Chart/candles):
   ```bash
   npm run dev
   ```
   Of: `npx tsx server.ts`

2. Open de app:
   - **http://localhost:3000** als je `npm run dev` gebruikt (één proces, aanbevolen)
   - Of een andere poort als je de frontend apart start (bijv. **http://localhost:3001**)

De frontend roept de API altijd aan op **http://localhost:3000** (staat in `.env` als `VITE_API_ORIGIN`). Zolang de backend op 3000 draait, werken Chart en candles op welke frontend-poort je ook opent.
