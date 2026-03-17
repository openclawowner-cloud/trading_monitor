Project-specific rules for this crypto trading monitor:

- Keep the architecture market-centric, not symbol-centric.
- Use market_id where trading venue matters.
- Treat fills as source of truth for execution.
- Treat positions as derived state/snapshots.
- Treat trades as journal/analysis entities.
- Strategies return intents/signals, never execute orders directly.
- Keep the event model observability-first and causally traceable.
- All important actions must support correlation_id, causation_id, source_component, and severity.
- Keep backtest logic deterministic and easy to test.
- Keep exchange/provider integrations isolated behind adapters.
- Do not mix chart/UI logic with trading domain logic.
- Keep simulation logic, risk logic, data ingestion, and analytics separated.