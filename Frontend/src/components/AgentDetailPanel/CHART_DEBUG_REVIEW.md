# Chart / debug UI — repo-specific risk review

## 1. Candle time alignment vs trade timestamp alignment

**Wat waarschijnlijk goed is**
- `alignTradeTimeToBar(tsMs, interval)` (tradesPanelUtils.ts ~171–175) zet trade-timestamp (ms) om naar bar-open in **seconden** via `Math.floor(t / sec) * sec`; dat sluit aan op Binance-bar boundaries.
- Backend candles (candlesService.ts) gebruiken `time: Math.floor(t / 1000)` (seconden); de chart gebruikt die tijd voor candles.
- Markers krijgen dezelfde bar-time (seconden) als de candle-serie; lightweight-charts verwacht UTCTimestamp in seconden.
- `tradesInRange` (TabChart.tsx ~144–154) vergelijkt `tradeTimestampMs(t)` met `t0/t1` in ms (candle.time * 1000); eenheid is overal ms voor vergelijking.

**Mogelijk fout**
- Python `candle_time` in decision_context is `int(df["timestamp"].iloc[-1])` → Binance kline open time in **ms**. `formatDecisionTime(candleTime)` in de frontend behandelt het getal als ms; dat klopt. Als ergens anders `candle_time` in **seconden** zou worden geschreven (bv. uit API candles), zou de weergave 1000× fout zijn.

**Te controleren**
- `DecisionDetailBlock.tsx` ~84, ~105, ~126: `formatDecisionTime(candleTime)` — alleen aanroepen met `candle_time` uit telemetry (Python = ms).
- Python: `src/agents/cryptocoiner_v4.py` ~99, 125: `ts = int(df["timestamp"].iloc[-1])` en `"candle_time": ts`.

**Minimale fix**
- Geen codefix nodig zolang `candle_time` alleen uit Python komt (ms). Eventueel in `formatDecisionTime` of in de aanroep: als `ts < 1e12` aannemen dat het seconden zijn en `ts * 1000` gebruiken (vermindert risico bij mix van bronnen).

---

## 2. Symbol normalization / pair mapping

**Wat waarschijnlijk goed is**
- `normalizeChartSymbol` (tradesPanelUtils.ts ~141–145): `toUpperCase().replace(/[^A-Z0-9]/g, '')` — "NEAR/USDT" → "NEARUSDT", "nearusdt" → "NEARUSDT".
- Overal waar symbolen worden vergeleken wordt `normalizeChartSymbol` gebruikt: `tradesForSymbol`, `buildChartMarkers`, `getDefaultChartSymbol`, `collectChartSymbolSuggestions`.
- Backend candle-API valideert symbol met `SYMBOL_RE = /^[A-Z0-9]{6,24}$/`; frontend stuurt al genormaliseerd symbool.

**Mogelijk fout**
- Position-keys uit telemetry: `key.endsWith('_qty')` → sym = `key.replace(/_qty$/i, '')`; voor "NEARUSDT_qty" wordt dat "NEARUSDT". Als een agent ooit "NEAR_USDT_qty" zou schrijven, wordt "NEARUSDT" na normalizeChartSymbol hetzelfde. Geen bug zolang keys consistent zijn.
- `getDefaultChartSymbol`: `sym.length >= 6` filter; zeer korte symbolen (indien ooit) vallen weg.

**Te controleren**
- tradesPanelUtils.ts ~148–169 (getDefaultChartSymbol), ~178–191 (collectChartSymbolSuggestions), ~199–204 (buildChartMarkers filter op sym).
- TabChart.tsx ~136–139 (tradesForSymbol filter).

**Minimale fix**
- Geen; normalisatie is overal toegepast. Optioneel: in `getDefaultChartSymbol` expliciet `key.replace(/_qty$/i, '')` documenteren dat het geen "USDT" toevoegt (key is al volledig symbool).

---

## 3. Empty states (no symbol / no trades / no decision log)

**Wat waarschijnlijk goed is**
- Geen symbool: `noSymbol` (TabChart.tsx ~395–399) toont één duidelijke message; chart-container wordt niet gerenderd, useLayoutEffect runt cleanup bij `noSymbol`.
- Geen trades voor symbool: ~497–499 toont "No trades for this symbol in telemetry." alleen als `!loading && !error && tradesForSymbol.length === 0`.
- Decision log: de tabel (~544–614) staat in `decisionLogRaw.length > 0`; bij lege log wordt de sectie niet getoond.

**Mogelijk fout**
- Als `decisionLogRaw.length === 0` maar `latestDecision` wel bestaat (status wel, state.decision_log leeg of niet gezet), is er geen "geen decision log" tekst; dat is acceptabel (latest decision card is genoeg).
- Bij geen trades wordt de trades-lijst niet gerenderd; de "click to see decision context" uitleg ontbreekt dan — geen bug, alleen minder hint.

**Te controleren**
- TabChart.tsx ~395–399 (noSymbol), ~497–499 (trades empty), ~544 (decision log section guard).

**Minimale fix**
- Geen. Optioneel: als `decisionLogRaw.length === 0` en er wel `latestDecision` is, een korte zin "No decision log history" bij de Latest decision card.

---

## 4. Polling cleanup and race conditions (agent switch / tab switch)

**Wat waarschijnlijk goed is**
- `fetchGen.current` (TabChart.tsx ~288–292, ~317–318): na elke fetch wordt gecontroleerd `gen !== fetchGen.current`; late responses schrijven geen state en geen chart data.
- Polling: `useEffect` met `setInterval(..., POLL_MS)` en `return () => clearInterval(id)` (~336–339); bij unmount wordt de interval opgeruimd.
- TabChart wordt alleen gemount wanneer de Chart-tab actief is; bij tab-wissel unmount en cleanup.

**Mogelijk fout**
- Bij **agent switch** blijft TabChart gemount (zelfde paneel, ander agent); `agentId` en `detail` wisselen. `loadCandles` hangt van `[agentId, symbol, interval, limit, detail, ...]` af; een nieuwe fetch start. Oude fetch kan nog binnenkomen: die faalt de `gen !== fetchGen.current` check na de nieuwe fetch, dus geen stale data op de chart. **Risico**: als de oude fetch net vóór de nieuwe start klaar is en de nieuwe fetch daarna, dan wint de nieuwe (hogere gen). Geen probleem.
- **Detail** wordt door de parent bij agent-select geladen; bij snelle agent-wissel kan oude `detail` nog even in closure van `loadCandles` zitten. Omdat `fetchGen` elke aanroep verhoogt en we op gen checken, schrijven we alleen bij de laatste response; die hoort bij de laatste `agentId`/request. Kleine kans: als twee requests in verkeerde volgorde terugkomen (bijv. netwerk), dan kan de tweede (oudere) gen hebben; dan zouden we één keer verkeerde data tonen tot de volgende poll. Beperkt en zeldzaam.

**Te controleren**
- TabChart.tsx ~273–330 (loadCandles, gen check), ~332–339 (useEffect loadCandles + interval cleanup).
- AgentDetailPanel: TabChart wordt alleen gerenderd als `tab === 'chart'`; bij tab switch unmount.

**Minimale fix**
- Optioneel: in `loadCandles` ook `agentId` in de gen-check betrekken, bv. `const key = `${agentId}-${++fetchGen.current}`` en bij response vergelijken of we nog dezelfde agent tonen. Meestal voldoende: gen + dependency array.

---

## 5. v3 vs v4 telemetry compatibility

**Wat waarschijnlijk goed is**
- `getTradesFromDetail` leest `state?.trades ?? status?.trades`; geen v3/v4-specifieke paden.
- `decision_context` is optioneel op trades; v3-trades zonder dit veld tonen gewoon geen context in DecisionDetailBlock.
- `getLatestDecision` / `getDecisionLog` lezen alleen `latest_decision` en `decision_log`; v3 schrijft die nu ook (record_decision_v3).
- Contextvelden in DecisionDetailBlock: allemaal optioneel; v3 context heeft `allow_new_buys: null`, `trend_bias: "v3_no_regime_filter"` — weergave blijft correct.

**Mogelijk fout**
- Als v3 ooit geen `decision_log` of `latest_decision` zou schrijven (oude versie), zijn de UI-blokken gewoon leeg; geen crash.
- `formatDecisionTime(record.timestamp)`: v3/v4 schrijven beide ms; geen verschil.

**Te controleren**
- tradesPanelUtils.ts: getTradesFromDetail, getLatestDecision, getDecisionLog.
- DecisionDetailBlock.tsx: alle contextvelden optioneel, Row/value met "—" voor null.

**Minimale fix**
- Geen; ontwerp is backward compatible.

---

## 6. Latest decision fallback (status.latest_decision → state.latest_decision)

**Wat waarschijnlijk goed is**
- getLatestDecision (tradesPanelUtils.ts ~259–266): `const rec = (status?.latest_decision ?? state?.latest_decision) as ...` — expliciet eerst status, dan state.
- Daarna validatie: `rec != null && typeof rec.timestamp === 'number' && typeof rec.action === 'string'`; malformed data geeft null.

**Mogelijk fout**
- Geen; fallback en volgorde zijn correct.

**Te controleren**
- tradesPanelUtils.ts ~259–266.

**Minimale fix**
- Geen.

---

## 7. Decision log filtering order and selected row consistency

**Wat waarschijnlijk goed is**
- Volgorde: `decisionLogRaw` is al gesorteerd (newest first) in getDecisionLog; daarna filter (all/trades/hold/skip), dan `slice(0, 20)` (TabChart.tsx ~116–122). Dus: sort → filter → take 20. Correct.
- Geselecteerde rij in de tabel: `selectedLogRecord === r`; highlight en border-l kloppen.

**Mogelijk fout**
- **Latest decision card**: highlight gebruikt `selectedLogRecord === latestDecision`. Na een detail-refresh (poll/refetch) is `latestDecision` een **nieuw object** (nieuwe referentie); `selectedLogRecord` is nog het oude object. Dan is `selectedLogRecord === latestDecision` false en verliest de card haar "selected" styling, terwijl de gebruiker nog steeds dezelfde laatste beslissing ziet. DetailBlock blijft wel open (we tonen nog steeds selectedLogRecord), maar de card ziet er niet meer geselecteerd uit.
- **Log-table**: na refresh is `decisionLogFiltered` een nieuwe array met nieuwe objecten; `selectedLogRecord` (oud ref) komt in geen enkele `r` voor. De rij-highlight verdwijnt; het detailpanel toont nog de oude record (stale). Tot de gebruiker op Clear of een andere rij klikt.

**Te controleren**
- TabChart.tsx ~116–122 (filter order), ~412–414 (Latest decision card selected), ~576–584 (table row selected).
- tradesPanelUtils.ts ~248–257 (getDecisionLog sort).

**Minimale fix**
- Voor **Latest decision card**: selectie niet op referentie maar op inhoud doen, bv. `const isLatestSelected = selectedLogRecord != null && latestDecision != null && selectedLogRecord.timestamp === latestDecision.timestamp && selectedLogRecord.pair === latestDecision.pair`. Gebruik `isLatestSelected` voor de card-class. Zo blijft de card als "selected" zichtbaar na refresh als het nog steeds dezelfde beslissing is.
- Optioneel voor **log table**: bij detail-update `selectedLogRecord` clearen als die niet meer in `decisionLogFiltered` zit (semantische match op timestamp+pair+action), zodat we geen stale detail tonen. Of: selected record matchen op timestamp+pair+action in de tabel i.p.v. op referentie.

---

## 8. Chart resize / unmount cleanup correctness

**Wat waarschijnlijk goed is**
- useLayoutEffect (TabChart.tsx ~158–267): bij `noSymbol` wordt bestaande chart expliciet `remove()` en alle refs op null gezet. Bij mount (container beschikbaar) wordt één chart gemaakt, ResizeObserver gekoppeld, en in de cleanup: `ro.disconnect()`, `chart.remove()`, alle refs null. Geen dubbele chart.
- ResizeObserver callback past alleen width/height aan; geen nieuwe chart.
- Dependency `[noSymbol]`: als symbol wordt gewist, wordt noSymbol true en cleanup draait; chart verdwijnt. Als daarna weer een symbol wordt ingevuld, wordt een nieuwe chart gemaakt.

**Mogelijk fout**
- Als de **parent** TabChart unmount (bijv. tab wissel) terwijl `noSymbol` false is, is de cleanup dezelfde (return van useLayoutEffect); chart.remove() wordt aangeroepen. Geen leak.
- Edge: als containerRef.current nog niet gezet is op het moment van de effect (eerste frame na !noSymbol), dan is `el` null en wordt geen chart gemaakt; bij volgende render (container nu wel in DOM) draait de effect opnieuw en dan wel. Geen oneindige loop; dependency is [noSymbol].

**Te controleren**
- TabChart.tsx ~158–267 (useLayoutEffect create/cleanup), ~220–251 (ResizeObserver + return cleanup).

**Minimale fix**
- Geen; cleanup is correct. Optioneel: bij cleanup ook `markersRef.current?.setMarkers([])` of dergelijke aanroepen weglaten (chart.remove() maakt series/markers toch onbruikbaar); geen functionele wijziging nodig.
