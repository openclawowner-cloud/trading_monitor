import { TradingAgentsDashboard } from '../components/TradingAgentsDashboard';

const BYBIT_ENABLED = (import.meta.env.VITE_BYBIT_ENABLED ?? 'false') === 'true';

export function BybitPage() {
  if (!BYBIT_ENABLED) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
          <h1 className="text-lg font-semibold">Bybit</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Deze pagina is uitgeschakeld. Zet `VITE_BYBIT_ENABLED=true` om de tab te tonen.
          </p>
        </div>
      </main>
    );
  }

  return <TradingAgentsDashboard dataSource="bybit" />;
}
