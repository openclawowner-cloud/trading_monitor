import { TradingAgentsDashboard } from '../components/TradingAgentsDashboard';

const WOO_REAL_ENABLED = (import.meta.env.VITE_WOO_REAL_ENABLED ?? 'false') === 'true';

export function WooRealPage() {
  if (!WOO_REAL_ENABLED) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
          <h1 className="text-lg font-semibold">WOO Real</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Deze pagina is uitgeschakeld. Zet `VITE_WOO_REAL_ENABLED=true` om de tab te tonen.
          </p>
        </div>
      </main>
    );
  }

  return <TradingAgentsDashboard dataSource="woo_real" />;
}
