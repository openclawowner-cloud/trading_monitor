# Cryptocoiner v4 — Strategy Doc

## A. Zwakke punten huidige strategie (v3.1.2)

- **Averaging down te agressief:** 25/25/50 zet de grootste size het diepst in de move; bij een doorlopende dump loopt exposure en verlies snel op.
- **Catastrophic stop te laat:** Alleen na 3 entries én -2% onder gemiddelde kost; geen harde $-cap, dus één trade kan een groot deel van het kapitaal raken.
- **Geen regime/trend filter:** Mean reversion wordt ook in structurele downtrends gespeeld (geen check op MA50/MA100 of hogere timeframe).
- **Falling knives niet geweerd:** Geen limiet op BB-expansie, opeenvolgende rode candles of grote bearish body; entries kunnen midden in momentum-dumps vallen.
- **Jojo-add verhoogt exposure zonder regime-check:** Na partial TP kan jojo-add opnieuw bijkopen terwijl de context al zwak is.
- **Parameters verspreid:** Moeilijk om risk- en regime-filters in één keer aan te passen.

---

## B. Verbeterontwerp v4

- **Regime/trend filter:** Blokkeer nieuwe buys alleen in duidelijke downtrend: `price < MA50` en `MA50 < MA100`. Optioneel: 5m close ≥ 5m MA20 en 5m MACD histogram ≥ 0.
- **Risk-stop i.p.v. catastrophic stop:**  
  - Eén vaste prijs-drempel (1.5% onder avg cost), ongeacht aantal entries — stop wordt niet ruimer bij meer entries.  
  - Harde max loss per trade: `unrealized_pnl <= -INITIAL_BUDGET * MAX_RISK_FRACTION_PER_TRADE` (3%).  
  - Reason: `risk_stop_e1` / `risk_stop_e2` / `risk_stop_e3`.
- **Veiligere ladder:** 25/25/25, max 3 entries (configurable `MAX_ENTRIES`). Geen 50% meer in de derde stap.
- **Falling-knife filters:** Geen nieuwe entry als: BB-width > 4%, of >3 rode candles in laatste 5, of laatste candle body-drop > 2%. Geldt voor entry_1 én ladder én jojo-add.
- **Jojo-add strenger:** Alleen als `allow_new_buys` (trend + falling-knife + 5m) waar is; max size 40% van budget (JOJO_ADD_MAX_PCT).
- **Config-structuur:** Eén `CONFIG`-dict met alle tuneable risk- en regime-parameters.

---

## C. Concrete code changes

- **Nieuw bestand:** `src/agents/cryptocoiner_v4.py`.
- **Toegevoegd:**  
  - `CONFIG`-dict.  
  - `get_trend_context(df)`, `is_falling_knife(df)`, `get_bb_width_pct(ind)`, `higher_tf_ok(symbol)`, `allow_new_buys(df, ind, symbol)`.  
  - Risk-stop logica (price + dollar breach) in plaats van catastrophic stop.  
  - Ladder via `CONFIG["LADDER_WEIGHTS"]` en `CONFIG["MAX_ENTRIES"]`.  
  - Entry 1 + ladder + jojo-add achter `allow_new_buys`.  
  - Klines `limit=120` waar MA100 nodig is.
- **Ongewijzigd gebleven:** Universe, fee, partial TP, jojo TP/SL, MA20 exit, execute_trade, state/save, reden-labels (entry_1, entry_2, entry_3, partial_tp, jojo_tp, jojo_sl, ma20_exit; nieuw: risk_stop_e1/e2/e3).

---

## D. Parameter table oud vs nieuw

| Aspect | v3.1.2 | v4 |
|--------|--------|-----|
| Trend filter | Geen | `ENABLE_TREND_FILTER`: blokkeer alleen bij price &lt; MA50 en MA50 &lt; MA100 |
| Higher-TF | Geen | `ENABLE_HIGHER_TF_CONFIRMATION`: 5m close ≥ MA20, MACD hist ≥ 0 |
| Ladder weights | 25 / 25 / 50 | 25 / 25 / 25 (`LADDER_WEIGHTS`) |
| Max entries | 3 (hard) | 3 (`MAX_ENTRIES`, tuneable) |
| Stop type | Catastrophic: na 3 entries, -2% | Risk stop: 1.5% onder avg **of** -3% budget in $; reason risk_stop_e1/e2/e3 |
| Max loss per trade | Geen $-cap | `MAX_RISK_FRACTION_PER_TRADE` = 3% |
| BB expansion cap | Geen | Geen entry bij BB-width &gt; 4% (`MAX_BB_EXPANSION`) |
| Red candles | Geen | Geen entry bij &gt;3 rode in laatste 5 (`MAX_RED_CANDLES`) |
| Body drop | Geen | Geen entry bij body drop &gt; 2% (`MAX_BODY_DROP_PCT`) |
| Jojo-add max | 50% | 40% (`JOJO_ADD_MAX_PCT`); alleen als `allow_new_buys` |
| Cooldown na stop | 10 min | 10 min (ongewijzigd) |

---

## E. Waarom dit veiliger is

- **Minder extreme exposure:** 25/25/25 en vaste early stop beperken hoe ver je gemiddeld “naar beneden” koopt en hoe groot één positie wordt.
- **Vroegere en begrensde stop:** 1.5% prijs-drempel + 3% $-cap per trade beperken tail losses; stop wordt niet ruimer bij meer entries.
- **Minder entries in slechte regimes:** Trend- en 5m-filter + falling-knife checks verminderen mean-reversion trades in echte downtrends en tijdens scherpe dumps.
- **Jojo-add alleen in betere context:** Verlaagt het risico dat je na partial TP opnieuw zwaar bijkomt in een zwakke markt.

---

## F. Trade-offs

- **Minder trades in sterke dumps:** Sommige recovery-runs (waar v3 na -2% nog zou bijkopen en later herstellen) worden in v4 eerder afgesneden met een gecontroleerde loss. Verwachting: lagere bruto winst in die scenario’s, maar kleinere drawdowns.
- **Meer “gemiste” entries:** Trend- en 5m-filter kunnen in randgevallen een geldige mean-reversion setup blokkeren; de parameters zijn bewust tuneable om dit af te stemmen.
- **Iets meer complexiteit:** Extra helpers en CONFIG; logica blijft modulair en leesbaar.
