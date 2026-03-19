# Decision telemetry (v3.1.2 & v4)

## Where it lives

| Location | Content |
|----------|---------|
| `paper_state.json` → `trades[].decision_context` | Snapshot at **execute** time |
| `paper_state.json` → `decision_log` | Rolling last **100** cycle/trade records |
| `paper_state.json` → `latest_decision` | Same as last `decision_log` entry |
| `latest_status.json` → `latest_decision` | Copy for quick UI read |

## API

`GET /api/trading/live/agent/:id` returns `state` + `status` unchanged structurally; new fields are optional and backward compatible.

## v4 vs v3 context

- **v4**: `allow_new_buys`, `higher_tf_ok`, `falling_knife_blocked`, `bb_width_pct`, `trend_bias` populated.
- **v3.1.2**: regime flags are `null`; `trend_bias` = `v3_no_regime_filter`.

## Not logged (without larger refactor)

- Separate entry/exit scores (not computed today)
- Full scan trace for all ~100 pairs per cycle (only last probed pair on skip)
- Historical indicator series (only last bar)
