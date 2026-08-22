# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo. **Read §0 and §1 always.** The rest is reference — jump to the section that owns the file you're about to touch.

---

## 0. TL;DR

| | |
|---|---|
| **What** | "Pakmut Wealth" (repo `wealth-lab`, Expo slug `narix`) — personal finance + investment tracker. UI is **Thai**. |
| **Stack** | Expo 54 / RN 0.81 / React 19 → **shipped as a web SPA on Vercel**. iOS/Android compile but native is not configured (no bundle ids). |
| **Backend** | Supabase (Google OAuth + Postgres + RLS). No server of ours except two Vercel proxies in `api/`. |
| **Correctness gate** | `npx tsc --noEmit`. **No test runner, no linter.** |
| **Two render gates** | fonts (`App.tsx`) → auth + FX cache (`src/navigation/index.tsx`). Both return `null`/spinner until ready. |
| **State** | No global store. Every screen re-reads its storage service in `useFocusEffect`. |
| **Removed, don't reintroduce** | MT5 grid trading, in-app AI assistant (`aiService`/`AIAssistant`), `react-native-iconify`. |

Scale to expect: `PortfolioScreen` **2876** lines, `HomeScreen` 1935, `TaxScreen` 973. Read the screen's row in §7.2 before opening it.

**Both hubs were split (2026-08-12).** พอร์ต and ภาษี each used to stack every feature as a full card in one scroll. Now each heavy card is its own route, and the hub keeps a one-line summary + a way in: พอร์ต → `LifeLedger` / `Cycles` (ซึ่งพาไป `Realized` ต่อ) / `DryPowder` / `RedSignals` / `PurchaseGoals`, ภาษี → `TaxIncome` / `TaxDeduction`. Nothing was removed. **Add a new area as a route + a summary row, not as another card on the hub.**

---

## 1. Rules that break the app if ignored

Ranked by how often they've already caused a bug.

1. **Both mappers or the field vanishes.** DB snake_case ↔ TS camelCase via `mapXFromDb`/`mapXToDb` in every `*Storage.ts`. Add a field to one side only and it silently drops on save *and* load. (`investmentPlanStorage`, `portfolioGoalStorage` map inline — same rule, two inline blocks.)
2. **Never pair `fontWeight` with `fontFamily`** — web fake-bolds an already-weighted file. Pick weight by file: `NotoSansThai_300Light/_400Regular/_500Medium/_600SemiBold` (SemiBold is the heaviest loaded). Every `Text`/`TextInput` must set a family or the system font leaks in.
3. **No desktop max-width, ever.** `DESKTOP_MAX_WIDTH`/`DESKTOP_CONTENT_MAX_WIDTH` were deleted from `useResponsive()` and all screens. Fix a sparse wide layout by **adding columns**. Only overlays (modal cards 400–500px, login card) may cap width.
4. **`TextInput` in a flex row needs `minWidth: 0`** on top of `flex: n`. On web it's an `<input>` whose intrinsic ~20-char width becomes its minimum, so `flexShrink` can't shrink it (measured: 141px of overflow in a 279px card). Native never shows this; only deployed web does.
5. **Don't gate "stack vertically" on `isMobile`** — the 768–1023 tablet band is neither `isMobile` nor `isDesktop`, so rows stay side-by-side and get crushed. Branch on `!isDesktop`.
6. **Every `Modal` card is a `ScrollView`** with `maxHeight: '100%'` + `flexGrow: 0`, padding on `contentContainerStyle`. `public/index.html` sets `body { overflow: hidden }` — a too-tall modal's save button becomes unreachable.
7. **Locking a card to a pixel width also needs `flexBasis`.** `flex: 1` compiles to `flex: 1 1 0%` and `flex-basis: 0%` beats `width` — set `width` alone and the card collapses to zero.
8. **Browser-blocked APIs go through `api/*.js`.** Yahoo/Frankfurter/metals.live send no `Access-Control-Allow-Origin`: fine from curl/Node, silent `"Failed to fetch"` in a browser. **Verify price/network changes in a headless browser (Playwright), never curl** — curl cannot reproduce CORS.
9. **Never put an API key in client code.** `TWELVE_DATA_API_KEY` lives in Vercel env, read by `api/twelve-data.js`. Anything in `src/` ships in the bundle.
10. **Dialogs go through `utils/dialog.ts`** (`notify`, `await confirmAsk`) — `react-native-web` no-ops `Alert.alert` with buttons. They now render in `components/DialogHost.tsx`, mounted once in `App.tsx` **outside `NavigationContainer`** (several callers `notify()` then navigate immediately; inside the navigator the toast is popped with the screen). Remove the host and every dialog silently falls back to `window.alert`. Icons: Ionicons from `@expo/vector-icons` only. Colors: `COLORS` in `utils/constants.ts` only.
11. **Don't make `refreshCurrencyCache()` fire-and-forget** (§5.2) — totals paint with fallback rates and stay wrong until remount.
12. **Thai everywhere** — new user-facing strings and code comments in Thai. Dates with year > 2400 (BE) go through `toChristianYear()`.
13. **Never declare a component inside a screen's render body.** A wrapper defined in the function body is a new component type every render, so React remounts its subtree and every `TextInput` inside loses focus after one keystroke. This shipped in `TaxScreen` and made the tax form unfillable. Hoist to module scope, pass state as props (`Section` there is the reference fix).

---

## 2. Commands

```bash
npm run web              # expo start --web  (npm run dev same; npm run react same on :8081)
npm run start            # expo start (pick platform)
npx tsc --noEmit         # the only test. Run before every commit.
npx expo export --platform web   # prod build → dist/  (Vercel's buildCommand)
```

**Expected typecheck state:** app code clean; the only errors are the 8 in `supabase/functions/telegram-bot/index.ts` (Deno globals under the app tsconfig). Anything else is yours.

```bash
git push origin main
vercel --prod --scope thehearttoonas-projects --yes   # may exceed a 2-min tool timeout; re-run if so
```
`vercel.json`: `buildCommand`, `outputDirectory: dist`, SPA rewrite `"/((?!api/).*)" → "/"`. Vercel project **`wealth-lab`**; `priceApi.ts` hardcodes `https://wealth-lab-omega.vercel.app` as `PROD_API_ORIGIN`, so **local dev hits the production proxies**.

**Schema changes are applied by hand** in the Supabase SQL editor — no `migrations/`. Hand the user an idempotent `alter table ... add column if not exists ...` and commit it under `sql/`.

---

## 3. Repo map

| Path | Owns |
|---|---|
| `App.tsx` | Font gate + provider tree (Gesture → SafeArea → Navigation) |
| `src/navigation/index.tsx` (407) | All routes, both layouts, auth + FX gates → §7.1 |
| `src/screens/*.tsx` (29) | All UI → §7.2 |
| `src/services/*.ts` (26) | Supabase I/O + external APIs → §4 |
| `src/utils/*.ts` (29) | Pure domain logic, all business rules → §6 (plus `receiptScan.ts`, the shared Gemini-OCR picker used by `AddExpenseScreen` **and** `QuickAddSheet` — callback-based on purpose, see its header) |
| `src/types/*.ts` (11) | Shapes + the tax/deduction/gain constant tables |
| `src/components/` | `ActionButton` (ปุ่มมาตรฐานทุกจอ, §7.4) + `MenuRow`/`MenuCard` (แถวเมนู "ตัวเลขล่าสุด + ทางเข้า" ใช้ร่วมกัน `PortfolioScreen` + `CyclesScreen`) + `Mascot` (น้องหมุด, §7.5) + `charts/` (2, §7.3) + `CycleCard`/`CycleModals` (the cycle UI, §6.5, used by `CyclesScreen`) + `DialogHost` (all toasts/confirm cards, §1.10) + `TaxFormKit` (`NumberInput`/`num`/`taxStyles` shared by the three tax screens) + `TaxSavePlanCard` (the zero-tax deduction plan, §6.6 `taxSavePlan`) + `QuickAddSheet` (the bottom sheet behind Home's FAB, §7.2) |
| `src/hooks/useAuth.ts` | Supabase session/user/loading/signOut |
| `api/*.js` (2) | Vercel CORS proxies: `yahoo-quote`, `twelve-data` → §5.1 |
| `sql/*.sql` (21) | Hand-run schema, idempotent → §8 |
| `supabase/functions/telegram-bot/` | Deno edge fn, receipt OCR via Gemini → §9 |
| `public/funds.json` | 3,031 Thai funds (494 KB), lazily fetched |

**Stale docs — do not trust:** `README.md` (pre-pivot expense-tracker copy) and `.github/copilot-instructions.md` (claims "no backend", AsyncStorage-only). **CLAUDE.md is the accurate document.**

---

## 4. Storage layer

- `getUserId()` lives in `services/supabase.ts` — import it, never re-declare. It calls `auth.getUser()` on **every write**.
- Reads are bare `.select('*')` with **no `.eq('user_id', …)`** — isolation is 100% **RLS**. Writes attach `user_id` (RLS `WITH CHECK`). Deletes are `.eq('id', …)`.
- Supabase URL + publishable key are **hardcoded** in `services/supabase.ts` (public anon key, RLS-protected — intentional). `.env` `EXPO_PUBLIC_SUPABASE_*` is dead config.
- **No offline cache, no local mirror.** AsyncStorage holds the auth session only.
- Three recurring patterns: **optional-column fallback** (strip the column named in the Postgres error, retry — substring match, fragile; exists because users may not have run newer `sql/`), **table-missing tolerated** (`isCatalogTableMissing`, `isTaxTableMissing`, `isPurchaseGoalTableMissing`, `ignoreMissingTable`), **per-user singleton** (`.maybeSingle()` + `upsert`).

### 4.1 Modules and their traps

| Module | Table(s) | Trap |
|---|---|---|
| `storage.ts` | `expenses`, `recurring_bills` | Generic name but **expenses + recurring bills only**. Expenses have **no mapper** (raw). `monthly_amounts` jsonb `YYYY-MM → amount`; `bill.amount` is a placeholder, `dueDay`/`isActive` legacy. |
| `incomeStorage.ts` | `incomes` | **No mappers** (raw). `getIncomesByMonth` uses `.like('date','YYYY-MM%')` — depends on the stored date format. |
| `investmentStorage.ts` (381) | `investments`, `transactions` | `setRedAck()`/`updateInvestmentPrices()` patch **only their own columns** — swapping in `updateInvestment` sends the whole row and overwrites concurrent edits with stale screen data. Delete an investment's `transactions` **first** (no cascade), non-transactional. `getPortfolioSummary()` **returns zeros on any error**. `summarizeInvestments()` adds `fees` unconverted (assumed THB). Nothing writes `transactions`. |
| `realizedStorage.ts` | `realized_trades` | **No FK to `investments`** on purpose — selling out deletes the investment but history must survive. `platform`/`source_investment` ride the optional-column retry, so **a save can succeed while dropping the undo snapshot**. |
| `taxStorage.ts` (210) | `tax_profiles` | `upsert(onConflict:'user_id,year')`. `months` jsonb is the source of truth; scalars are derived and lossy. Two legacy paths run on **every read** (yearly scalars → per-month values, `extra_deductions` → `deductions.other`) and the first save persists them. |
| `userProfileStorage.ts` | `user_profile` | Singleton. 5 dead-but-not-dropped columns, moved to `tax_profiles.year_facts` because they change yearly; upsert touches only sent columns. |
| `activityLogStorage.ts` | `activity_log` | Append-only. **Every error swallowed by design** — call it only *after* the real write succeeds. Never logs price refreshes (would flood). Readers exist, no screen uses them. |
| `cycleStorage.ts` (205) | `investment_cycles` | §6.5. One open cycle per basket, enforced by a **partial unique index** — the duplicate-key error is translated to Thai, don't let Postgres's own text reach the user. Returns `[]` when the table is missing but **`openCycle` throws** (a button that does nothing is worse). `closeCycle` only stamps the snapshot; the caller must have sold every leg first. |
| `redSignalStorage.ts` | `red_signals` | §7.2 `RedSignalsScreen`. ประวัติสัญญาณ "ถึงคิวลงไม้" สะสม. **`signal_key` + unique index `(user_id, signal_key)` เป็นหัวใจ** — พอร์ตเช็คแท่งเทียนใหม่ทุกครั้งที่โฟกัส/ทุก 5 นาที ไม่มีคีย์กันซ้ำสัญญาณเดียวจะกลายเป็นหลายสิบแถวในวันเดียว. `recordRedSignals` เป็น **upsert `ignoreDuplicates: true`** — ห้ามเปลี่ยนเป็น upsert ธรรมดา ไม่งั้น `outcome` ที่ผู้ใช้กดจะถูกรีเซ็ตเป็น `pending` ทุกครั้งที่เปิดจอ — และกลืน error ทุกตัวแบบ `activityLogStorage`. `enterable` เป็น `boolean \| null` สามสถานะ: mapper แปลง `null → undefined` ("ไม้นี้ไม่อยู่ในรอบ" ต้องไม่กลายเป็น "เข้าไม่ได้"). |
| `investmentPlanStorage.ts` | `investment_plan` | Singleton; returns `null` if `salary_set_aside_percent` **or** `dca_rounds` is null, so a dry-powder-only row reads as "no plan". `dryPowder` must equal `sumDryPowderItems(items)` (needs a warm FX cache). The `powder_*` leg-sizing columns (§6.7) ride the same optional-column retry — `powder_base_thb`/`powder_started_at`/`powder_legs_used` are the anchor, and **only เริ่มก้อนใหม่ may write them**. |
| `purchaseGoalStorage.ts` | `purchase_goals` | `reorderPurchaseGoals` = one UPDATE per id on purpose (bulk upsert nulls unsent columns); non-atomic. `getPurchaseGoals` **throws** on missing table. |
| `catalogRename.ts` | 3 tables | Currency/platform are raw strings, so renames fan out. **`renamePlatformEverywhere` never touches `realized_trades.platform`** (known gap). Non-transactional. |
| `importStorage.ts` | `expenses`, `incomes`, `account_transfers` | Only writer of `account_transfers`. Dedup key `date|amount|description.slice(0,24)` — truncated, so distinct rows collide. Read errors ignored → everything looks new. |
| `fundCatalog.ts` | none | One `/funds.json` fetch per page load; on failure the shared promise resolves `[]` while `cache` stays null → **fund search dead until reload**. Web-only URL. |
| `currencyStorage.ts` | `user_currencies` | ถือ `fee_percent`/`fee_min` = ค่าธรรมเนียมมาตรฐานของตลาดที่ซื้อขายด้วยสกุลนั้น (ชั้นรองจากแพลตฟอร์ม — §6 `tradeFee`) พร้อม optional-column retry ของตัวเอง. **Side-effect module** — `refreshCurrencyCache()` writes the globals behind `convertToTHB` (§5.2). Returns `[]` (not throw) when the table is missing. |
| `lifeCostStorage.ts` | `life_costs` | §7.2 `LifeCostScreen`. มี mapper สองทาง · `setLifeCostReserved` patch คอลัมน์เดียว (ส่งทั้งแถวจะทับค่าที่จออื่นเพิ่งแก้) · `restartLifeCostCycle` เลื่อน `started_at` **แล้วล้าง `reserved` เป็น 0** เพราะเงินก้อนนั้นถูกใช้ไปกับรอบที่เพิ่งจบ ถ้าไม่ล้างรอบใหม่จะขึ้นว่าเก็บครบแล้วทั้งที่ยังไม่ได้เก็บ. |
| `lifeGoalStorage.ts` | `life_goals` | §7.2 `LifeGoalScreen`. `setLifeGoalAchieved` patch คอลัมน์เดียว · `achieved_at` ประทับครั้งเดียวแล้วอยู่อย่างนั้น — **แอปไม่ประทับให้เอง** ต่อให้ยอดถึงเป้า คนต้องกดยืนยัน (จอแค่ขึ้นปุ่มชวน). |
| `lifeLedgerStorage` | `life_ledger` | §7.2 `LifeLedgerScreen`. หนึ่งแถว = หนึ่งเดือนที่จด · **unique index `(user_id, month)` เป็นหัวใจ** ไม่มีคีย์นี้ กดจดเดือนเดิมซ้ำได้สองแถวแล้วยอดสะสมเด้งเป็นเท่าตัวเงียบ ๆ (เหตุผลเดียวกับ `red_signals`) · แต่ `saveLedgerMonth` เป็น **upsert แบบเขียนทับ ไม่ใช่ `ignoreDuplicates`** เพราะกดเดือนเดิมซ้ำที่นี่คือ "แก้ยอดให้ถูก" — ไม่มีฟิลด์ที่ผู้ใช้กดแล้วห้ามถูกรีเซ็ตอย่าง `red_signals.outcome` · `id` = `${userId}:${month}` คงที่ เพื่อให้ upsert แถวเดิมได้ id เดิม |
| `ledgerProfit` | (อ่านเท่านั้น) | **ทางเดียวของ "กำไรที่เอามาหักบัญชีชีวิต"** ซึ่งสามจอต้องได้เลขเดียวกัน (บัญชีชีวิต · ปลดล็อกรางวัล · แถวเมนูในพอร์ต). `loadLedgerProfit` คิด **ภาษีรายปีภาษี ปีละครั้งบนกำไรรวมของปีนั้น** ผ่าน `calculateTax(...).taxFromGains` — ไล่คิดต่อไม้แล้วบวกจะได้ภาษีต่ำกว่าจริง (§6.5). ปีที่ยังไม่มีโปรไฟล์/ยังไม่กรอกเดือนไหน = `taxKnown: false` **ห้ามกลืนเป็นภาษี 0**. `loadLifeLedger(trades?)` คืนบัญชีทั้งใบและ **ทนตารางหาย** (คืนบัญชีเปล่า) เพราะจอที่เรียกมีเรื่องหลักของตัวเองอยู่แล้ว — หน้าบัญชีเองต่างหากที่โหลดแยกเพื่อขึ้นข้อความให้ไปรัน SQL |
| the small ones | | `portfolioGoalStorage` singleton, and its `PortfolioGoal` type lives in **`utils/investmentGoals.ts`** · `accountStorage`: `Account.platform` → `investment.platform` is the link that makes §6.4 work · `platformStorage` imports `isCatalogTableMissing` from `currencyStorage`, has mappers (fee columns) and its own optional-column retry for `fee_percent`/`fee_min_thb`/`fee_min_currency` (สกุลของขั้นต่ำ — ไม่ตั้ง = บาท) — `null` there means *not set*, never *free* (`estimatePlatformFee` in `types/investment.ts` returns `null` for it) · `installmentStorage` orders by the `start_month` string · `pendingNavigation` is a 5-line nav side channel, not persisted · `priceApi` (764) → §5.1 |

---

## 5. External data

### 5.1 Prices — `services/priceApi.ts` + `api/*.js`

Sources: **Binance** (crypto) → **CoinGecko** fallback (`CRYPTO_ID_MAP` ≈55 symbols); **Twelve Data** → **Yahoo** for stocks (both via proxy); **Yahoo `GC=F`** for gold (USD/troy-oz → USD per baht-tong: `/31.1035*15.244`); **open.er-api.com** for FX.

- **Thai stocks skip Twelve Data** (free tier 404s on SET) and go straight to Yahoo. A dotless symbol is tried as `SYM.BK` **first**, then bare `SYM` — bare `PTT` matches a US fund.
- `exchangeRateCache`: module-level, 1-hour TTL, USD-based (cross rates by division). On failure it returns a hardcoded table and does **not** cache it — callers can't tell real from fallback.
- `readJson()` returns null unless the content-type says json — guards against Metro serving `index.html` with HTTP 200.
- `fetchPricesForItems()` is the batch entry: crypto batched per currency (Binance 400s the whole batch if one pair is unlisted → retried individually), one gold fetch per currency, stocks via `mapWithConcurrency` at `STOCK_CONCURRENCY = 4` (Twelve Data free tier: 8 req/min, 800/day). **Records only prices > 0**; failures are absent from the map.
- `getTwoRedDays()` **drops still-open candles**, else today's in-progress bar fakes a signal. `{count:0,met:false}` = rule active not yet due; `null` = unsupported/unfetchable — the UI distinguishes them. `streakStartAt` (first bar's open time) is what tells one streak from the next (`utils/redAlert.ts`); if you slice `opens/closes/lows`, slice `times` too. `high` is fetched but unread.
- Nearly every network path `console.error`s and returns `null`/`[]`. **No error propagates to callers.**
- **Fund NAV has no live API** (SEC Open Data is oldest-first, 100/page, no latest filter) → static `public/funds.json` + manual NAV entry; `isPriceRefreshable('fund')` is false.
- `api/yahoo-quote.js` is the template for a new proxy: validate params, set `User-Agent`, add `Access-Control-Allow-Origin: *`, 502 on upstream failure. `api/twelve-data.js` allowlists `endpoint ∈ {quote, symbol_search}` and still carries a committed `FALLBACK_KEY` — rotate and delete it.

### 5.2 The two currency systems — read before reconciling any total

| | `utils/constants.ts#convertToTHB` | `priceApi.ts` |
|---|---|---|
| Rates | **user-set** (`user_currencies.rate_to_thb`) | **live** (open.er-api.com) |
| Used by | every screen total, `getPortfolioSummary`, all of `src/utils/*` | price fetching only |
| Sync? | **No** — the two will disagree | |

`convertToTHB` must work **synchronously during render**, so it can't await Supabase: it reads module globals seeded with defaults (`THB 1, USD 35, EUR 38, JPY 0.24, CNY 4.8`) that `refreshCurrencyCache()` overwrites via `setCurrencyCatalog()`.

- **`Navigation` blocks render on `refreshCurrencyCache()`** (`currencyReady`). The cache is a module global, not React state, so nothing re-renders when rates land — turn this back into a fire-and-forget `useEffect` and every total paints at USD=35 until remount.
- `setCurrencyCatalog` **forces `rates.THB = 1`** after merging user input; without it, typing a THB rate rescales the whole app.
- Only `number && > 0` rates are accepted; unknown currencies fall back to `1` (treated as THB), not `NaN`. `hasCurrencyRate()` exists so the catalog screen can warn about that 1:1 assumption.
- `refreshCurrencyCache` swallows its errors — a failed fetch degrades silently to defaults.

---

## 6. Domain logic — `src/utils/`

Pure functions, no React. **This is where the product's judgment lives** — most files are mostly guard clauses, and each guard exists because its absence produced a confidently wrong number.

`MS_PER_YEAR = 365.25*24*3600*1000` and `MIN_YEARS(_FOR_ANNUALIZED) = 0.25` are **duplicated in `holdingAnalysis`, `realizedAnalysis`, `investmentGoals`**, each commented as intentionally matching the others. Change one and they silently desync.

### 6.1 Tax — `utils/taxCalc.ts` (429) + `types/tax.ts` (698)
Thai PIT (ภ.ง.ด.90/91) estimator. Brackets, the 50%-capped-at-฿100k salary expense, the ฿60k personal allowance, social-security caps, every deduction item and the per-asset gain rules are **data in `types/tax.ts`**, not `if`s, so they're editable per year.

- **Salary/bonus/withholding/social-security live in `TaxProfile.months`** — 12 rows in jsonb. Scalar columns are derived and written for console readability only; **never read back for calculation** (`monthly_salary` is a lossy rounded average).
- **Deliberately NOT read from `incomes`** — the tax screen owns its numbers so there's never a second source of truth. "เติมจากรายรับ" is a one-time prefill, not a live link.
- Monthly entry doesn't make tax more accurate (PIT is annual: `40k×6 + 45k×6` = `42.5k×12`); it exists for per-month withholding, mid-year raises, and separating actual-so-far from projected.
- **Never show a partial-year total as the annual estimate** — brackets are non-linear (8 months of ฿50k run through gives ฿4,200 vs ฿20,600, ~5× low). `calculateTax` returns `filledMonths`; `projectFullYear()` is a *separate* projection (missing months filled from the last filled one, **bonus forced to 0**). Two distinct cards on screen.
- **Deductions are itemized**: `DEDUCTION_ITEMS` + `deductions` jsonb map. `sumDeductions()` (in `types/tax.ts`, called by `calculateTax` — one code path, so screens can't disagree) applies per-item `cap`, `capPercentOfIncome`/`capPercentOfNet`, and the two shared cap groups `retire500k` / `lifeHealth100k`. Legacy rows with only `extra_deductions` fall back to it until any itemized key exists.
- **`TaxYearFacts`** (`tax_profiles.year_facts` jsonb) holds what changes yearly (home loan, ม.33, PVD, maternity, 180-day residency); `user_profile` holds only cross-year identity (birth date, marital status, dependants) — **the storage split is unchanged, but since 2026-08-13 both are edited on `TaxDeductionScreen`**; only birth date is still entered on `PersonalInfoScreen`. `utils/deductionAdvice.ts` joins the two into `eligible | not_eligible | unknown` — **three states, not two**: "not filled in" must never render as "not entitled".
- **The ฿190,000 age-65+/disabled exemption is income exemption, not a deduction** — subtracted *before* the 50% expense, and passed in via `TaxCalcOptions.incomeExemption` to keep `taxCalc` pure. Every caller must pass the same value or the tax screen and the portfolio card disagree.
- **Losses clamp at 0 per asset type** — no loss carry-forward against salary for individuals, so a losing crypto year must not cut tax on wages.
- **Gain tax is a difference, not `gain × marginalRate`** — `estimateGainTax` runs `calculateTax` twice (with and without the gain as `otherIncome`) so the sell form, portfolio card and tax screen can never disagree.
- **Social-security limits are keyed by tax year** (`socialSecurityLimits(year)` over `SOCIAL_SECURITY_BASE_STEPS`): base cap 15,000 → **17,500 from BE 2569** → 20,000 (2572) → 23,000 (2575); monthly max 750/875/1,000/1,150; annual cap 9,000/10,500/12,000/13,800. Past years are selectable — never collapse this to one constant.
- `taxYearOf()` round-trips through `toChristianYear` then adds 543, so grouping is always BE.
- **Still missing:** dividends and the dividend tax credit; brackets and the personal allowance are single constants, not year-keyed like social security.

### 6.2 Sell review — `utils/sellReview.ts` (179)
Compares each `realized_trades` sell price against today's price to answer "would holding have been better?", then prescribes a rule empirically (sold-too-early → trailing stop / scale out; well-timed → don't bolt on a rule). No new user input.

Guards that must not be removed: sales newer than `MIN_DAYS_TO_JUDGE` **30** are `too_recent` and leave both the counts *and* the money totals (checked **before** the flat band); ±`FLAT_BAND_PERCENT` **3%** is `flat` (daily noise, not skill); under `MIN_TRADES_FOR_DIAGNOSIS` **3** judged trades → `not_enough_data`; `sells_too_early` needs **both** ≥0.6 of judged trades **and** `netTHB > 0`; **median, not mean**, for `sinceSellPercent`; Thai funds have no price API → `unknown`. `priceKeyOf = type:SYMBOL:currency` (same ticker in another currency is a different key — the sell price is denominated in it). The screen must print how many trades fell out of the conclusion and state the hindsight caveats.

### 6.3 Purchase goals — `utils/purchaseGoals.ts`
Wishlist gated on trading performance: an item priced X unlocks when **realized** profit reaches `multiplier × X` (default 10; presets 3/5/10/20).
- **Realized only** (`summarizeRealized(trades).totalPnlTHB`) — unrealized profit unlocks nothing.
- **A queue, not a shared pool**: ordered by `sortOrder` (ties by `createdAt`); the top item consumes its full quota before profit flows down.
- **Marking an item bought consumes `price × multiplier` permanently** — the rest of the queue drops back and rebuilds.
- Negative realized P/L → `availableTHB` clamps at 0; price and multiplier clamp at 0 (a negative would *increase* headroom).
- **`reservedTHB` (2026-08-22) หักก่อนคิวทั้งคิว** — ยอดค้างของ `LifeLedger` (§6.8) กินกำไรก่อนรางวัล เพราะค่าเสื่อม + ค่าใช้จ่ายประจำเป็นของที่ต้องจ่ายอยู่ดี รางวัลเป็นของที่เลือกจะซื้อ. ไม่หักก่อน = กำไรก้อนเดียวดูเหมือนจ่ายได้ทั้งสองอย่าง (นับซ้ำ). `unlockAtTHB` ต้องบวก `reserved` เข้าไปด้วย ไม่งั้นการ์ดบอกว่าปลดล็อกที่ ฿50,000 ทั้งที่จริงต้องถึง ฿50,000 + ยอดค้าง. **ทุกจอที่โชว์คิวต้องส่งค่าเดียวกัน** (`PurchaseGoalsScreen` + แถวเมนูใน `PortfolioScreen` — ทั้งคู่เรียก `loadLifeLedger`).

### 6.4 Net worth — `utils/netWorth.ts`
`netWorth = portfolioValue + cash − remainingDebt`. Almost the whole file is one guard: **reserve accounts double-count** — a `role: 'reserve'` account's `manualBalance` is *cumulative funded amount*, so money already invested still sits in it. Worked example in the code: funded 80,000, bought 75,988, portfolio 79,408 → naive 159,408; correct `(80,000−75,988)+79,408 = 83,420`. Reserve accounts are **grouped by `platform` before** subtracting invested cost (else two accounts on one platform each subtract the whole cost); `Math.max(0, funded − invested)` keeps cash non-negative; reserve accounts with no `platform` are used as-is; `hasUnfilledAccount` lets the UI say the cash figure is an under-estimate.

### 6.5 Investment cycles — `utils/cycles.ts` + `types/cycle.ts` + `components/Cycle*.tsx`
The user's actual strategy: DCA into dips (the red-candle rule) and **close the whole basket** when the basket's aggregate profit hits target, then open the next cycle. The unit of account is the **cycle**, not the leg — a leg closed at break-even is not a mistake here.

- **One open cycle per basket** (`investment_cycles_open_per_basket`, a partial unique index). Two open cycles in one basket makes "which cycle does this new leg join?" unanswerable.
- **Baskets are per asset type by default**, not one global basket: gain tax differs (Thai stocks exempt, crypto not) and one asset running would otherwise force closing another that's still deep red. `basket: 'all'` is supported if the user really wants one basket.
- **The target is a % of the cycle's cost**, never of portfolio value — on portfolio value, adding a leg moves the target by itself.
- **`requiredBouncePercent` must be shown next to the profit %.** Profit % alone flatters averaging down: it looks closer to target while the money at risk grows. This is the number that says how far the target really is.
- **The number that decides this strategy is ammo left, not profit** — `budgetLeftTHB` ÷ the dry-powder per-round figure = `roundsLeft`. A grid dies from running out of capital while holding max size at max loss, not from the average cost failing to fall.
- **`canAddLeg` returns a Thai reason, never just false** — the UI greys the button *with* the reason. A vanished button reads as a broken app; a greyed one reads as your own rule working.
- **Legs join a cycle at creation** (`AddInvestmentScreen` looks up the open cycle for the type) or by an explicit "ดึงเข้ารอบ" press. **Never auto-adopt orphan legs on load** — `cycleId: null` is the deliberate escape hatch for "the reason I bought this broke, but I still hold it", and auto-adopting would drag it back every time the screen opens.
- **Closing is resumable by construction:** insert the `realized_trade` *then* delete the investment (reverse order loses it from both places on a mid-way failure), and only stamp `closeCycle` after re-reading the portfolio and confirming the basket is empty. Fail on leg 7 of 12 and the cycle simply stays open — pressing ปิดรอบ again sells the rest. No recovery state to keep.
- **Legs with no live price are excluded from a close** — selling them at cost would record a fake break-even trade. So a basket holding a manual-NAV fund can't be fully closed from the card; sell that leg by hand.
- **The cycle snapshot (`closed_*`) is summed from `realized_trades` of that cycle**, including partial sells earlier in the cycle, and is stored because trades can be undone later.
- **Tax on a close is computed once on the summed taxable gain**, not per leg then added — a big gain spans brackets, so per-leg sums come out low.
- Cycle-level return replaces per-leg CAGR, which this strategy makes permanently `null` (`realizedAnalysis` needs ≥0.25y average hold). `annualizedCyclePercent` refuses to annualize under `MIN_DAYS_FOR_ANNUALIZED` (**30**) and the UI says why.
- **การ์ดรอบต้องบอก "ตั้งขายที่ราคาเท่าไหร่" (2026-08-21)** — `exitPlanForCycle` ใน `utils/cycles.ts` คิดสองราคาต่อตัว: **คุ้มทุน** (ขายแล้วเท่าทุนพอดี) กับ **ถึงเป้า** (ขายตัวนี้ที่ราคานี้แล้วทั้งรอบถึงเป้า โดยตัวอื่นขายที่ราคาปัจจุบัน). %กำไรของรอบบอกได้แค่ "ยังไม่ถึง" เอาไปตั้งคำสั่งขายไม่ได้.
  - **ต้องหักค่าธรรมเนียมขาขายเสมอ** — ต้นทุน (`legCostTHB`) รวมค่าธรรมเนียมขาซื้อไว้แล้ว ที่ขาดคือขาขาย ถ้าไม่หัก ราคาคุ้มทุนที่โชว์จะต่ำกว่าจริงแล้วคนตั้งขายตามจะขาดทุนทั้งที่จอบอกว่าเท่าทุน. ค่าธรรมเนียมเป็น `max(%, ขั้นต่ำ)` จึงมีสองกรณี — `grossNeededFor` เอา **max ของทั้งสองคำตอบ** (กรณีที่ไม่ใช่ตัวคุมให้เลขต่ำกว่าเสมอ จึงไม่มีทางประเมินต่ำเกิน).
  - **ค่าธรรมเนียมที่ยังไม่ได้ตั้ง = ไม่รู้ ไม่ใช่ 0** (กฎเดียวกับ `estimatePlatformFee`) — คิดราคาโดยไม่มีค่าธรรมเนียมได้ แต่ต้องชู `feeUnknown` ให้การ์ดพิมพ์บอก ไม่ใช่ปล่อยให้อ่านเหมือนโบรกฟรี. `CyclesScreen` โหลด `getPlatforms()` + `getCurrencies()` แล้วส่ง `feeOf(platform, currency)` เข้ามา (ตัว resolver อยู่ที่ `utils/tradeFee`) — `utils/` จึงไม่ต้องรู้จัก `services/` (แบบเดียวกับ `powderStatus` ที่รับ `symbolCount`).
  - แยกตัวด้วย `symbol:currency` (เหรียญเดียวกันคนละสกุลคือคนละราคา — เหตุผลเดียวกับ §6.2) · `targetPrice` เป็น `null` เมื่อตัวอื่นพาถึงเป้าได้เองอยู่แล้ว · **ยังไม่รวมภาษีกำไร** (ตัวนั้นคิดตอนกดปิดรอบ).
- **This is basket-close/grid in a real portfolio** — related in shape to the removed MT5 grid trading (§0), but it never sends an order: every buy and every close is a human press, and prices come from an API that fails silently (§5.1), so auto-closing is deliberately not built.

### 6.6 The rest

| File | Sharp edge |
|---|---|
| `constants.ts` (167) | `COLORS`, `CHART`, `FONTS`, `TEXT` presets, FX cache (§5.2), `toChristianYear`, formatters. **Never use `COLORS.primary` as a chart color**, and never pair green `#22A06B` with red `#D64545` in a chart — ΔE 5.4 under deuteranopia (needs ≥8), hence `CHART.expense = #3A6DB0`. `formatCurrencyWithType` uses 4 decimals below 1 so crypto isn't `฿0.00`. `toChristianYear` converts only when `year > 2400`. |
| `responsive.ts` (45) | Breakpoints mobile 0 / tablet 768 / desktop 1024 / wide 1440; `sidebarWidth` 240 wide else 200. Header documents the removed max-widths (§1.3). |
| `realizedAnalysis.ts` (119) | Realized CAGR uses a **cost-weighted average hold** (`Σcost·years / Σcost`), not a mean of per-trade percentages. `avgHoldYears < 0.25` → `annualReturnPercent: null` **plus `tooShort: true`**. `isWin` is strictly `> 0`. |
| `holdingAnalysis.ts` (33) | Positions younger than 0.25y return `tooNew` (annualizing a 2-week move gives thousands of %). Ratio math on native-currency prices, no FX. `getYearsToTarget` unused. |
| `investmentGoals.ts` (187) | **Projection-rate precedence is deliberate: `realized` > `user` > `actual`.** If none is `> 0`, every projection field is `null`, not fabricated. `requiredMonthlyContribution` ถูกปลุกมาใช้แล้วที่การ์ด "ให้พอร์ตจ่ายค่าเสื่อมแทน" (§7.2 `LifeCostScreen`) ที่เหลือ (step arrays, `yearsToReachGoal`, `monthsToReachGoal`) ยังไม่มีใครเรียก. |
| `portfolioCoverage.ts` (67) | `coverage = profitNow / expenseYTD`, plus the return needed to cover expenses **and `INFLATION_RATE` 2.5%**. **`profitNow` is unrealized profit to date, not this year's — never label it "กำไรปีนี้".** Outputs `null` (not 0/∞) when the denominator ≤ 0. |
| `installments.ts` (50) | `getEndMonth = start + totalMonths − 1` makes the range inclusive. `getRemainingInstallments`/`getInstallmentNumber` return **`null`, not 0**, when the plan isn't active that month — `netWorth` depends on it. Zero-padded keys sort chronologically as strings. |
| `activityLog.ts` (220) | Builds the Overview feed from storage services, **not** from the `activity_log` table. Dates go through `toChristianYear` first; `NaN` sorts as 0 into an explicit `'ไม่ทราบวันที่'` bucket instead of being dropped. Installment-start events carry `amountTHB: null`. `buildMonthlyFlow` **excludes investment buys/sells** so investing doesn't read as spending. |
| `statementParser.ts` (154) | Bank-agnostic paste parser (KBank / K PLUS / SAV passbook): every line carries a running balance, so amount *and* direction come from the delta. **Amounts must have exactly 2 decimals** — the one guard stopping reference numbers being read as money. **`IN_KW` before `OUT_KW`** (`'รับโอนเงิน'` contains `'โอน'`). Opening-balance lines are seeds. Direction: delta > `X1/X2` code > keyword > default `out`. Sets `needsReview` instead of guessing. |
| `aiAnalysis.ts` (247) | **Not LLM-backed** — local heuristics over `getExpenses()` + `getPortfolioSummary()`, zero network, branded "AI วิเคราะห์". Thresholds: top category >30%, MoM ±20%/−10%, run-rate >1.5×, stock >70%, crypto >20%. MoM compares the **same 1..N day window** and needs `dayOfMonth >= 5` (the old code printed "ลดลง 100%" every 2nd); `stock_th`+`stock_foreign` collapse to one key first. |
| `redAlert.ts` (40) | Suppressing a snoozed alert needs **both** `count <= redAckCount` **and** the streak's first bar matching `redAckStreakAt` — count alone swallows a broken-then-restarted streak of equal length. `streakStartAt == null` → trust the count. Changing the red rule clears the ack. |
| `redSignalLog.ts` (154) | คู่กับ `redAlert.ts`: `buildRedSignalKey` = `ชนิด:ตัวย่อ:กรอบเวลา:ทุกกี่แท่ง:สตรีค:ครั้งที่` — ตัวที่แยก "สัญญาณคนละครั้ง" คือ **`streakStartAt` + ครั้งที่** ไม่ใช่จำนวนแท่ง (เหตุผลเดียวกับ §6.5/`redAlert`). API ไม่ให้เวลาแท่ง → คีย์ถอยไปอิงวันที่ที่เห็น (กันซ้ำได้ในวันเดียว แลกกับสัญญาณข้ามวันของสตรีคเดิมถูกนับใหม่). `followRatePercent` คิดจาก **ที่บันทึกผลแล้วเท่านั้น** และคืน `null` ไม่ใช่ 0 (0% อ่านว่า "ไม่เคยทำตามเลย"). |
| `dialog.ts` (190) | Store + routing only, no UI (that's `components/DialogHost`). Same two exports as before, so the ~133 call sites are untouched. **`notify` short text → toast (resolves immediately)**; text with `\n` or over 120 chars → card that waits for a press; `confirmAsk` is always a card. Kind is guessed from the Thai text and **`ERROR_RE` is tested first** — otherwise `บันทึกไม่สำเร็จ` matches `สำเร็จ` and paints green. Cards are a queue (one at a time) or a cancel press answers the wrong question. Falls back to `window.alert`/`Alert.alert` when no host is mounted; the native path still passes `onDismiss` → resolve, without it an Android back-press leaves the promise **pending forever**. |
| `taxSavePlan.ts` (500) | §6.1's sibling: จัดลำดับ "เครื่องมือลดหย่อน" ตามอายุ แล้วไล่ใส่จนภาษีเป็น 0 (`buildTaxSavePlan`). **จำลองล้วน — ห้ามเขียนยอดลง `profile.deductions`** (อ้างสิทธิ์ที่ยังไม่ได้จ่าย = ประมาณการภาษีต่ำกว่าจริง ผิดทิศเดียวกับ `DEFAULT_GAIN_RULES`). **ไม่คิดเพดานซ้ำเอง** — หยั่ง (`PROBE`) ผ่าน `sumDeductions` ตัวจริง จึงได้เพดานทั้งสามชั้นฟรี และกฎเปลี่ยนที่เดียว. ลำดับ = `have → invest → insure → give` (เงินหายจากกระเป๋าไหม) และในกลุ่ม invest เรียงตาม **ปีที่ล็อก** ซึ่งทำให้อันดับขึ้นกับอายุเอง (RMF ของคนอายุ 52 ล็อก 5 ปี = เท่า Thai ESG, ของคนอายุ 30 ล็อก 25 ปี). **ไม่เดายอดที่ต้องดูจากสลิป/ใบเสร็จ** (`RECEIPT_KEYS`) — ไปอยู่ `fillFirst` ไม่ถูกนับเป็นตัวเลขในแผน. ต้องโชว์ `savedPerBaht` ทุกขั้น + จุดคุ้มสุด (`lowValueNet`): ช่วงท้ายที่ลากลงมาถึง 0 ประหยัดแค่ 5% — โชว์แต่ "ถึง 0" คือชวนให้จ่ายก้อนที่คุ้มน้อยสุดโดยไม่รู้ตัว. `leftover` คิดเพดานบน map **หลังแผน** ไม่ใช่ตอนเริ่ม (ไม่งั้นประกันบำนาญโชว์ว่าเหลือ 200,000 ทั้งที่กลุ่มเกษียณเต็มไปแล้ว). ฐานต้องเป็น **ทั้งปี** (`projectMonths`) ไม่ใช่ยอดที่กรอกจริง |
| `tradeFee.ts` (85) | ค่าธรรมเนียมของคำสั่งซื้อขาย ตั้งได้ **สองชั้น** และมีลำดับตายตัว: **แพลตฟอร์ม** (ถ้าตั้ง) → **สกุลเงิน** (ค่ามาตรฐานของตลาดนั้น) → **ไม่รู้ (`source: null`)**. มีชั้นสกุลเงินเพราะโบรกหุ้นไทยหลายเจ้าเรตใกล้กันหมด การพิมพ์เลขเดิมซ้ำทุกเจ้าคือความ manual ที่ไม่ได้อะไรกลับมา — และลืมสักเจ้าแปลว่าราคาคุ้มทุนของไม้นั้นขาดค่าธรรมเนียมไปเงียบ ๆ. **ขั้นต่ำมีสกุลของมันเอง** (IBKR $1 ไม่ใช่ 1 บาท) ทุกอย่างแปลงเป็นบาทให้เรียบร้อยก่อนคืน. `tradeFeeTHB` คืน `null` เมื่อไม่มีใครตั้ง — **null ≠ ฟรี**. |
| `expenseLadder.ts` (130) | **ด่านที่ต้องผ่านก่อนเป้าอื่นทั้งหมด** — ค่าเสื่อม + บิลประจำคือของที่ต้องจ่ายทุกเดือนเหมือนกัน จึงอยู่บันไดเดียวกัน เรียงจากทุนน้อยไปมากเพื่อให้ปลดอันแรกเร็วที่สุด แล้วเงินที่เคยจ่ายอันนั้นว่างมาเร่งขั้นถัดไป (debt snowball กลับด้าน). ⚠️ **ทุนที่ต้องมี = ยอดต่อปี ÷ (ผลตอบแทน − เงินเฟ้อ)** ไม่ใช่หารด้วยผลตอบแทนเปล่า ๆ — ค่าเน็ตวันนี้ไม่ใช่ค่าเน็ตอีก 10 ปี ที่ 7%/2.5% ทุนต่างกันถึง 56% พลาดตรงนี้แล้วตัวเลขให้ความมั่นใจเกินจริง. ผลตอบแทน ≤ เงินเฟ้อ = คืน `reason` ไม่ใช่ Infinity. `avgMonthlyBill` ใช้ **ยอดที่กรอกจริงเฉลี่ย** จาก `monthlyAmounts` ไม่ใช่ `RecurringBill.amount` ที่เป็นแค่ค่าอ้างอิง (§4.1). |
| `lifeCost.ts` (150) | §7.2 `LifeCostScreen`. เฉลี่ยเส้นตรง `(ราคา − ขายต่อได้) ÷ รอบ(เดือน)` · `addMonths` บวกเดือนแบบปฏิทินจริง (31 ม.ค. + 1 เดือน = สิ้น ก.พ.) · `shouldHave` ตัดไม่ให้เกินยอดเต็ม · เรียงเลยกำหนดขึ้นก่อน. **สองข้อห้ามที่เขียนไว้ในหัวไฟล์: ห้ามเอา `perMonth` ไปรวมกับรายจ่ายจริง** (จะนับซ้ำตอนซื้อของจริง) **และห้ามเอามูลค่าคงเหลือไปบวก `netWorth`** (§6.4 คือ พอร์ต + เงินสด − หนี้ เท่านั้น). |
| `lifeGoal.ts` (110) | §7.2 `LifeGoalScreen`. `planLifeGoals` แยกด่านเป็น ผ่านแล้ว/กำลังทำ/รอคิว — ด่านปัจจุบันคือด่านแรกที่ยังไม่ประทับ `achievedAt` ไม่ใช่ด่านแรกที่ยอดยังไม่ถึง · `lifeGoalEta` คืน **`null` ไม่ใช่ Infinity** เมื่ออัตราเก็บ ≤ 0 และไม่คิดผลตอบแทน (จอต้องพิมพ์ "ถ้าเก็บได้เท่าเดิม" กำกับ) · `mascotStageForLevels` = ด่านที่ผ่าน + 1 (สูงสุด 5). **ด่านที่ผ่านแล้วห้ามถอย** ต่อให้ยอดตกทีหลัง — เหตุผลเดียวกับที่ขั้นมาสคอตห้ามผูกกับมูลค่าพอร์ต. |
| `lifeLedger.ts` (185) | §6.8 · §7.2 `LifeLedgerScreen`. **บัญชีเดินสะพัด ไม่ใช่โควตารายเดือน** — ยอดค้างไม่มีวันครบกำหนด. จ่ายเดือนเก่าก่อน (FIFO) เพื่อให้ "ฟรีไปแล้ว N เดือน" มีความหมายเดียว. **ขาดทุนจากการขายห้ามไปเพิ่มยอดค้าง** (clamp 0 — กฎเดียวกับ `availableTHB`) · **ต้นทุนของเดือนที่จดแล้วห้ามคิดใหม่ตามค่าปัจจุบัน** จึงเก็บเป็นแถว ไม่ใช่ `perMonth × จำนวนเดือน` (ไม่งั้นยอดสะสมขยับทุกครั้งที่เพิ่มรายการค่าเสื่อม) · เดือนที่ยอด 0 นับ `covered` แต่ไม่นับเข้า `monthsCovered` (จดเดือนเปล่าไม่ควรได้เครดิต). `ledgerFirstMonth` แยกออกมาให้จอกรองไม้ก่อนคิดกำไร — ไฟล์นี้จึงไม่ต้องรู้จัก `services` (แบบเดียวกับ `feeOf` ใน `exitPlanForCycle`) |
| `takeProfit.ts` (33) | Suggested take-profit % per asset class (crypto 40 / stocks 20 / fund 15 / gold 12). **Entirely unused**, like its pair `getYearsToTarget`. |
| `deductionAdvice.ts` (193) | §6.1. Needs the `TaxYearFacts` of **the year being viewed**, not the current year, or 2568 shows 2569's advice. |

### 6.7 Leg sizing — `utils/dryPowder.ts` (200)
How big the next DCA leg is. **One code path for all three screens** (`DryPowder`, `Cycles`, `Portfolio`'s ถึงคิวลงไม้) — they must never disagree on เงินต่อไม้.

The user's formula (chosen 2026-08-14, replacing the weighted ladder):

```
ไม้ถัดไป = เงินทุนปัจจุบัน ÷ (จำนวนหุ้น × จำนวนครั้งต่อหุ้น)
จำนวนครั้งต่อหุ้น = powderSpanDays ÷ powderEveryDays   (อย่างน้อย 1)
```

- **`powderStatus(plan, symbolCount)` takes the symbol count as an argument** — `utils/` stays free of `services/`. Every caller must pass `countSymbols(investments)`; forget it and that screen silently sizes for 1 stock. `countSymbols` keys on `type:SYMBOL` because **DCA legs of one stock are separate `investments` rows** — counting rows counts legs, not stocks.
- **`powderSpanDays` is the style knob** (`SPAN_PRESETS` 1 / 7 / 30 / 90 / 180 / 365 days): 1 day = ยิงทีเดียว, so `roundsPerSymbol` clamps to ≥1 and the leg becomes `ทุน ÷ หุ้น`. Long span = smaller legs, deeper drawdown covered.
- **The divisor in code is legs *remaining*** (`legsPlanned − legsUsed`), which equals `หุ้น × ครั้ง` exactly at batch start, so it *is* the formula above — but it keeps the leg constant instead of decaying. The old `เหลือ ÷ N` was a constant-fraction ladder: leg k = `B₀·(1/N)·(1−1/N)^(k−1)`, a convergent series that **never terminates** — 10 legs deploy only 65% of the pot. Correcting the noted balance after each buy is what triggered the decay, so the app punished honest bookkeeping. Don't "simplify" the divisor back to `legsPlanned`.
- **This needs an anchor that `แก้ยอด` never touches.** `powderBaseTHB`/`powderStartedAt`/`powderLegsUsed` reset **only** on เริ่มก้อนใหม่. Reset them whenever the balance is corrected and the decay comes straight back.
- `legsUsed` is a **hand-kept counter**, like the balance itself — the screen reconciles it against purchases since `powderStartedAt` and warns, never auto-increments (same reasoning as §6.5's "never auto-adopt orphan legs").
- **Symbol count is live, not snapshotted** — buying a new symbol raises `legsPlanned` by `roundsPerSymbol` and shrinks the leg. Chosen deliberately over a snapshot; the screen's footer says so.
- Empty portfolio → counts as 1 stock with **`symbolCountAssumed: true`**, and the UI must print that. A silent 1 would be a confidently wrong number.
- Ships `underfunded` (next leg < `UNDERFUNDED_RATIO` 0.7 × `base ÷ legsPlanned` = you outspent the plan) and `depthCoveredPercent` = `roundsLeftPerSymbol × stepPercent` — **per symbol, not per basket**: `legsLeft × step` across 5 stocks reads "รับดิ่งได้ 100%" and is meaningless.
- No `legacy` branch any more: unrun SQL just means the span/every columns read `undefined` and the defaults (30 / 7) apply, which are valid. `powder_legs_planned` and `powder_shape` still exist in `sql/` but **nothing reads or writes them** — kept because dropping columns destroys data.
- **`utils/powderFlow.ts` (2026-08-20) เป็นของอ่านอย่างเดียว — แยกจากไฟล์นี้โดยตั้งใจ.** กระสุนของผู้ใช้เป็น **กระแส** (เติมทุกสัปดาห์) ไม่ใช่ก้อนที่ตั้งแล้วใช้จนหมด คำถามที่ตอบไม่ได้มาตลอดจึงเป็น "ปกติลงสัปดาห์ละเท่าไหร่" ซึ่งเป็นฐานของการวางแผนเก็บเงินเพิ่ม. `buildPowderFlow` แบ่งการซื้อจริง (`investments` + `realized_trades`) เป็นสัปดาห์ **จันทร์–อาทิตย์ตามปฏิทินจริง** · `powderPace` เทียบวันที่ผ่านไปกับไม้ที่ลงแล้ว · `powderWindow` ให้ป้ายช่วงของก้อน. **ห้ามให้ค่าจากไฟล์นี้ย้อนไปคูณ/หารกับเงินหรือขนาดไม้เด็ดขาด** — ทริกเกอร์ซื้อคือราคา ไม่ใช่ปฏิทิน ถ้าปฏิทินคุมเงินเมื่อไรมันจะกลายเป็น "ต้องลงให้ทันสิ้นสัปดาห์" ทันที. ค่าเฉลี่ย **ตัดสัปดาห์ปัจจุบันทิ้งเสมอ** (ไม่งั้นทุกวันจันทร์ค่าเฉลี่ยดิ่ง) และนับเฉพาะสัปดาห์ที่ไม่เก่ากว่าการซื้อครั้งแรก (ไม่งั้นคนเพิ่งเริ่มได้ค่าเฉลี่ยเกือบศูนย์) — คืน `null` ไม่ใช่ 0 เมื่อยังไม่มีสัปดาห์ที่จบ.
- **"น่าจะเหลือ" ≠ หักเงินอัตโนมัติ.** จอคิด `ยอดที่จด − ที่ซื้อไปหลังจดยอด` ให้ดู แต่เขียนทับยอดได้เฉพาะตอนกดยืนยัน และ **เฉพาะเมื่อมีรายการเดียวและเป็น THB** — หลายรายการ/สกุลอื่น แอปไม่รู้ว่าเงินออกจากบัญชีไหน ต้องเปิดโมดัลให้คนเลือกเอง. เส้นทางนี้เป็น "แก้ยอด" จึง **ห้ามแตะ `powderBaseTHB`/`powderStartedAt`/`powderLegsUsed`**.
- `dcaRounds` is now **only** the not-null gate that makes `getInvestmentPlan` return a row. Nothing computes with it; pacing comes from `powderEveryDays`. The buy trigger is a price event (the red-candle rule), not the calendar.

### 6.8 บัญชีให้พอร์ตจ่ายชีวิต — `utils/lifeLedger.ts` + `services/ledgerProfit.ts`
เจ้าของขอเอง (2026-08-22): เอาค่าเสื่อม + ค่าใช้จ่ายประจำมาเป็น **เป้ากำไร** ไม่ใช่แค่เป้าลงเงิน — "ถ้ามันโควเวอร์ได้ ถัดไปคือกำไรจริง ๆ แล้ว"

**นี่คือที่ที่ต้องอ่านก่อนแตะอะไรก็ตามที่ผูกกำไรกับปฏิทิน.** §7.2 `LifeCostScreen` เคยห้าม "เป้ากำไรรายเดือน" ไว้ และคำสั่งห้ามนั้น **ยังอยู่** — ของที่สร้างขึ้นตรงนี้เป็นของคนละแบบ:

| | โควตารายเดือน (**ยังห้าม**) | บัญชีเดินสะพัด (ของที่มีอยู่จริง) |
|---|---|---|
| อ่านว่า | "เดือนนี้ต้องทำกำไรให้ได้ ฿X" | "ตอนนี้ค้างอยู่ ฿X (Y เดือน)" |
| เส้นตาย | มี — สิ้นเดือน | **ไม่มี** ยอดค้างไม่รีเซ็ต ไม่ครบกำหนด |
| ผลต่อพฤติกรรม | วันที่ 30 ต้องขายให้ครบเป้า | รอกำไรก้อนถัดไป ซึ่งมาตอนรอบถึงเป้า |

เดือนเป็นหน่วยของ **การจด** เท่านั้น ไม่ใช่หน่วยของกำหนดชำระ — เหตุผลเดียวกับที่ `powderFlow` ห้ามให้ปฏิทินคุมขนาดไม้ (§6.7).

- **จดเป็นเดือน ไม่มีวัน** (เจ้าของเลือกเอง) — หนึ่งแถวต่อเดือน เก็บสองก้อนแยกกัน: ค่าเสื่อม (จาก `summarizeLifeCosts().perMonth`) และค่าใช้จ่ายประจำ (จาก `monthlyAmounts` ของเดือนนั้นจริง ๆ ถอยไปใช้ `avgMonthlyBill` เมื่อเดือนนั้นยังไม่กรอก).
- **บัญชีเริ่มที่เดือนแรกที่จด และไม่รีเซ็ตรายปี** (เจ้าของเลือกเอง) — กำไรที่ขายก่อนเดือนแรกไม่นับ มันไปจ่ายเดือนที่ไม่เคยอยู่ในบัญชี.
- **กำไรหักภาษีก่อน** (เจ้าของเลือกเอง) — `loadLedgerProfit` คิดรายปีภาษี ปีละครั้งบนกำไรรวมของปีนั้น ผ่าน `taxFromGains`. ปีที่ยังไม่กรอกเงินเดือน = `taxKnown: false` แล้วจอพิมพ์บอกว่าเลขยังเป็นก่อนภาษี — **ห้ามกลืนเป็น 0**.
- **การจดเป็นการกดของคน ไม่ใช่ระบบเติมให้เอง** — แอปรู้แค่ยอดที่ตั้งไว้ ไม่รู้ว่าเดือนนั้นชีวิตเรียกเก็บจริงเท่าไหร่ (หลักการเดียวกับยอดกระสุน §6.7 และ `achievedAt` ของด่านชีวิต).
- **ยอดค้างกินกำไรก่อนคิวรางวัล** (§6.3 `reservedTHB`) — ลำดับที่เจ้าของเลือก: ค่าชีวิตก่อน รางวัลได้ที่เหลือ.
- ทุกถ้อยคำบนจอต้องอ่านเป็นกระดานคะแนน ไม่ใช่ใบแจ้งหนี้ — และห้ามเขียนแบบตำหนิ (กฎเดียวกับแถบจังหวะใน `DryPowderScreen`).

---

## 7. UI layer

### 7.1 Navigation — `src/navigation/index.tsx` (407)

Boot order: `useAuth().loading` → spinner · `user && !currencyReady` → spinner · `!user` → `<LoginScreen />` (rendered **outside** any NavigationContainer, not a route) · else the navigator.

**One `Stack.Navigator` serves both layouts**; only the root screen and chrome differ.
- **Desktop (≥1024):** `DesktopSidebar` is a persistent shell **outside `NavigationContainer`**, so pushing a sub-screen keeps it visible. The active tab is local state in `Navigation` — above the container — and reaches `DesktopRootScreen` through **`DesktopTabContext`**; don't move it back inside the navigator. A sidebar press also `navigationRef.navigate('Pakmut Wealth')`, else it looks dead while a pushed screen covers the pane. No tab navigator on desktop at all.
- **Mobile:** root screen is `MobileTabNavigator` (bottom tabs).

`TAB_ITEMS` is the single source for both: `HomeTab` (หน้าหลัก, inline SVG icon) · `PortfolioTab` (พอร์ต) · `ProfileTab` (โปรไฟล์). The root route is literally named **`'Pakmut Wealth'`** because child screens render the route name in their back button.

Stack routes: `AddExpense`, `AddInvestment`, `ManageByPlatform`, `AddIncome`, `IncomeScreen`, `Installments`, `AddInstallment`, `Accounts`, `ManageCatalog`, `ImportStatement`, `Overview`, `Statistics`, `Tax`, `TaxIncome`, `TaxDeduction`, `PersonalInfo`, `SellReview`, `PurchaseGoals`, `Realized`, `Cycles`, `DryPowder`, `RedSignals`, `LifeCost`, `LifeGoal`, `LifeLedger`. `TaxIncome`/`TaxDeduction` take `{ year }` — the BE year picker lives only on `TaxScreen`, so there is never a second place that changes the year. Dead: **`IncomeScreen` is registered but unreachable**; `RootStackParamList` also declares `Home`/`Portfolio`, which have no `Stack.Screen`.

**`ProfileScreen` is the route hub** — `MENU_GROUPS` there: *สรุป & วิเคราะห์* → **LifeGoal** / Overview / Statistics / Tax; *ข้อมูล* → PersonalInfo / Accounts / ManageCatalog / **LifeCost** / Installments / ImportStatement.

### 7.2 Screens

| Screen | Lines | Reached from | Notes |
|---|---|---|---|
| `PortfolioScreen` | **3199** | PortfolioTab | Still the heaviest file and the hub for 10 routes, but now only three things render here: portfolio header + goal, the **"ถึงคิวลงไม้"** red-candle card (kept because it is the one thing to act on today), and the holdings list + filters. Everything else is a `MenuRow` (`components/MenuRow`, module scope — §1.13) into its own screen. **Menu order (2026-08-22) puts the goal first, then the order you act in:** บัญชีให้พอร์ตจ่ายชีวิต (§6.8 — เป้าที่มาก่อนเป้าอื่น, โชว์ตลอดแม้ยังไม่เริ่ม) → เงินรอลงทุน → รอบลงทุน → บันทึกสัญญาณ → ปลดล็อกรางวัล → ภาษีจากกำไรที่ขาย (the last two only render when there is something in them). The `first` flag moved off เงินรอลงทุน onto the ledger row — two rows claiming `first` doubles the top border, none claiming it leaves a stray divider against the card edge. **`ผลงานที่ขายแล้ว` is no longer a row here** — it moved into `CyclesScreen`; the รอบลงทุน row carries the realized P/L on its sub-line so the entrance does not vanish from the hub. The refresh button lives **inside the header status line** next to the countdown (`PriceRefreshStatus`), not in the icon row — that row is only add / group-by-platform / manage-catalog now. The goal block shows the target **amount**, not `% ของเป้า`, and has no expandable detail. Price refresh (`PRICE_REFRESH_MS` 5 min staleness), grid math (`GRID_COL_TARGET` 380, `GRID_MAX_COLS` 6, `CARD_GRID_BASIS` 520), sell modal + portfolio-goal modal. It still loads `realizedTrades`/`cycles`/`plan`/`purchaseGoals`/`taxProfile` — **only to fill the summary numbers on the menu rows**; the editing lives in the child screens. Mount skips `refreshIfStale` — `useFocusEffect` already ran `loadData()`. |
| `RealizedScreen` | 548 | Cycles menu | ผลงานที่ขายแล้ว: realized KPI card, gain-tax card, the full trade list with **undo** (`undoSell` lives here now), link to `SellReview`. |
| `CyclesScreen` | 640 | Portfolio menu | รอบลงทุน (§6.5): `CycleCard`/`CycleStartCard`/`CycleHistoryCard` + settings/close modals + open/pull/close/delete, then a `MenuRow` at the bottom into **`Realized`** — every sell row *is* the result of a cycle (closing writes `realized_trades` leg by leg), so it reads next to the open and closed cycles rather than on the portfolio hub. การ์ดรอบยังโชว์ **"ตั้งขายที่ราคาไหน"** รายตัว (คุ้มทุน / ถึงเป้า รวมค่าธรรมเนียมขาย — §6.5) โดยจอโหลด `getPlatforms()` มาทำ `feeOf` ส่งให้ `exitPlanForCycle`. `powderPerRound` is read-only here — it is `nextLegTHBOf(plan)` from §6.7, set on `DryPowderScreen`; without it the card says so instead of printing "ยังไม่ได้ตั้งงบของรอบ" with nowhere to go. |
| `RedSignalsScreen` | 740 | Portfolio menu + ท้ายการ์ดถึงคิวลงไม้ | **บันทึกสัญญาณ** (เดิมชื่อ "ประวัติสัญญาณลงไม้", เปลี่ยน 2026-08-20 — §4.1 `redSignalStorage`). การ์ดในพอร์ตเป็นภาพของ "วันนี้" — สตรีคขาดแล้วสัญญาณหายไปพร้อมกัน หน้านี้เก็บสะสม: เตือนไปกี่ครั้ง · ลงจริงกี่ครั้ง (`followRatePercent`) · **ตอนนั้นเข้าไม่ได้กี่ครั้ง** (`canAddLeg` ตอนสัญญาณเกิด = หลักฐานว่าเพดานไม้/งบตั้งไว้แคบเกินไปหรือพอดี) · แยกตามตัว · ตัวกรอง 5 ปุ่ม · ปุ่มกดผลย้อนหลัง (กดซ้ำ = ล้างกลับเป็น pending) + โน้ต. บันทึกอัตโนมัติที่ `PortfolioScreen.loadData` ตอนเช็คแท่งเทียน — **ไม่มีตัวเช็คเบื้องหลัง** ไม่เปิดแอปเลยก็ไม่มีการบันทึก และหน้านี้ต้องพูดออกมาตรง ๆ |
| `DryPowderScreen` | 1338 | Portfolio menu | เงินรอลงทุน (§6.7). Three cards: **กระสุนที่เหลือ** (per-item notes + the จดยอด modal, unchanged) and **ขนาดไม้** — hero row `ไม้ถัดไป` / `เหลืออีก N ไม้`, a line spelling out the actual divisor, then `รับดิ่งได้อีก ~x%`, then the **สไตล์การลงเงิน** span chips and the steppers (ซื้อทุก ๆ กี่วัน · ลงไปแล้ว · ระยะห่างต่อไม้). `เริ่มก้อนใหม่` is the **only** thing that resets the anchor + leg counter; แก้ยอด must never touch them. The ladder preview and shape chips were removed 2026-08-14 with the formula change. `StepperRow` is at module scope (§1.13). **2026-08-20**: การ์ดกระสุนได้กล่อง **"น่าจะเหลือ"** (คิดยอดให้ + ปุ่ม ใช้ยอดนี้ ดู §6.7) · การ์ดขนาดไม้ได้ **แถบจังหวะ** (ผ่านมากี่วัน/ควรลงแล้วกี่ไม้ — "ช้ากว่าจังหวะ" ต้องเขียนแบบไม่ตำหนิ เพราะไม้ลงตอนมีสัญญาณ ไม่ใช่ตอนถึงกำหนด) · การ์ดใบที่สาม **"ลงไปสัปดาห์ละเท่าไหร่"** (จันทร์–อาทิตย์ 8 สัปดาห์ + ค่าเฉลี่ย, `utils/powderFlow`). |
| `HomeScreen` | 2014 | HomeTab | One combined income/expense/balance box, then a **ปฏิทิน / รายสัปดาห์ tab pair** (`calendarView`, starts on ปฏิทิน — no more desktop two-column, no collapsible week table), day lists with multi-select delete. Adding is **one FAB bottom-right** opening `QuickAddSheet`; the old paired buttons and the desktop top-bar pair are gone. The FAB and the sheet sit outside the `ScrollView` in a `styles.screen` wrapper. `renderWeekStrip`/`renderRecurringBills` are still defined but unreachable (pre-existing). Reads + clears `pendingNavigation` on focus — `QuickAddSheet` writes it on save. |
| `TaxScreen` | 1020 | Profile; Portfolio menu | Now summary-only: BE year picker, **one merged hero card** — big number = full-year tax (`projection.projected ?? breakdown`, labelled คาดการณ์ when projected, per §6.1), then sub-rows for จากที่กรอกจริง X/12, ภาษีจากกำไรขาย + the year's realized gain, and ลดหย่อนรวมที่หักได้. The three separate cards (จากที่กรอกจริง / คาดทั้งปี / ภาษีจากกำไรขาย) were merged 2026-08-13 — three equal big numbers never answered "so what do I owe". Two nav rows into `TaxIncome`/`TaxDeduction`, then the reference accordions (กำไรแยกชนิด / วิธีคิดตัวเลข / กฎรายสินทรัพย์ — the only editable one left / ขั้นบันได). All sections start collapsed. Origin of rule §1.13. |
| `TaxIncomeScreen` | 385 | TaxScreen | 12-month salary/bonus/withholding/SSO grid + "รับจริง" reverse-entry, เงินได้อื่น, the payroll auto-fill, calc box, save. Takes `{ year }`. |
| `TaxDeductionScreen` | 520 | TaxScreen | บนสุดคือการ์ด **"สูตรลดหย่อนให้ภาษีเป็น 0"** (`components/TaxSavePlanCard` + §6.6 `taxSavePlan`) — พับไว้, จำลองล้วน, ไม่เขียนลงช่องกรอก, มีชิปกดปิดเครื่องมือที่ไม่อยากใช้ (state ในหน้า ไม่บันทึก). **Owns the identity questions now** (marital status, spouse income, 4 dependant counts, own disability) in a card at the top — they still save to `user_profile`, so `handleSave` writes **both** tables. The lock gate is gone: not answering is a warning line, not a wall. `TaxYearFacts` yes/no rows, 18 itemized deductions with caps + eligibility badges, save. Takes `{ year }`. |
| `LifeLedgerScreen` | 560 | Portfolio menu (แถวแรก) · LifeCost | **บัญชีให้พอร์ตจ่ายชีวิต** (2026-08-22) — §6.8. การ์ดคำตอบ (ตัวเลขใหญ่สลับความหมาย: ยังค้าง = "ค้างอยู่" · จ่ายครบ = "กำไรจริงที่ยังไม่มีใครจอง") + แถบ % + สองก้อนแยก (ค่าเสื่อม / ค่าใช้จ่ายประจำ) + กำไรหลังภาษี · การ์ดจดเดือน (ชิป 12 เดือนย้อนหลัง ติ๊กเดือนที่จดแล้ว + ปุ่มจดเดือนนี้ ยอดเติมให้แก้ได้) · ลิสต์รายเดือนกดแก้/ลบได้ · แถวเมนูไป `PurchaseGoals` (โชว์ยอดที่เหลือให้รางวัล) และ `LifeCost`. อยู่ **แถวแรก** ของเมนูพอร์ตเพราะเป็นเป้าที่มาก่อนเป้าอื่น และโชว์ตลอดแม้ยังไม่เริ่ม (ทางเข้าที่โผล่หลังใช้แล้ว = ไม่มีทางเข้าตอนเริ่ม). ต้องรัน `sql/life_ledger.sql`. |
| `LifeGoalScreen` | 530 | Profile | **เป้าหมายใหญ่สุดของชีวิต** (2026-08-21) — บันไดเงินก้อนเป็นด่าน ๆ วัดจาก **ความมั่งคั่งสุทธิ** (`computeNetWorth`: พอร์ต + เงินสด − หนี้) ไม่ใช่มูลค่าพอร์ต. ด่านปัจจุบัน = ด่านแรกที่ยังไม่มี `achievedAt` · "อีกกี่สัปดาห์" มาจาก `buildPowderFlow().avgThbPerWeek` (§6.7) · **ขั้นของน้องหมุดมาจากที่นี่** (`mascotStageForLevels`). หัวจอมีแถว **"ด่านพื้นฐาน · ให้พอร์ตจ่ายชีวิตแทน"** อยู่**เหนือ**การ์ดเลเวลโดยตั้งใจ — เป้าเงินล้านไม่มีความหมายถ้าค่าเน็ตยังต้องจ่ายเอง (คำนวณที่ `expenseLadder` ที่เดียว ตรงนี้เป็นทางเข้าไม่คิดซ้ำ). ต้องรัน `sql/life_goals.sql`. |
| `LifeCostScreen` | 790 | Profile | **ค่าเสื่อมของชีวิต** (2026-08-21) — โน้ตบุ๊ก/ตรวจสุขภาพ/ประกัน: ของที่จะต้องจ่ายอีกแน่ ๆ แค่ยังไม่ถึงวัน. ตัวเลขเดียวที่หน้านี้ตอบคือ **"ต้องกันเดือนละเท่าไหร่"** + ต่อวัน/ต่อปี · การ์ดรายชิ้นบอกวันครบรอบ/ตามหลังอยู่เท่าไหร่ · ปุ่ม "จ่าย/ทำแล้ว" เริ่มรอบใหม่และล้างยอดที่เก็บไว้. **การ์ด "ให้พอร์ตจ่ายค่าเสื่อมแทน" (2026-08-22)** แปลงค่าเสื่อมเป็น **เป้าลงเงินต่อเดือน** ไม่ใช่เป้ากำไรรายเดือน — ทุนที่ต้องมี = ค่าเสื่อมต่อปี ÷ ผลตอบแทน (perpetuity) แล้วใช้ `requiredMonthlyContribution` (§6.6 `investmentGoals` ที่เดิมไม่มีใครเรียก) หา "ลงเพิ่มเดือนละเท่าไหร่". ⚠️ **การ์ดใบนี้ห้ามเปลี่ยนเป็นเป้ากำไรรายเดือน** — โควตากำไรรายเดือนสร้างแรงกดดันให้ขายตอนสิ้นเดือนให้ครบเป้า ซึ่งขัดกับทั้งระบบ (จังหวะขายมาจากรอบถึงเป้า ไม่ใช่ปฏิทิน — เหตุผลเดียวกับ §6.7 ที่ห้ามปฏิทินคุมเงิน). ส่วน "เป้ากำไร" ที่เจ้าของขอ (2026-08-22) ไปอยู่ที่ `LifeLedger` แทน ซึ่งเป็น **บัญชีเดินสะพัดไม่มีเส้นตาย** ไม่ใช่โควตา — ความต่างอยู่ใน §6.8 อ่านก่อนแก้ถ้อยคำการ์ดใดการ์ดหนึ่ง. หน้านี้มีแถวเมนูไป `LifeLedger` อยู่**เหนือ**การ์ดบันได (บันไดตอบ "ต้องมีทุนเท่าไหร่ถึงปลดถาวร" หลักแสน–ล้าน · บัญชีตอบ "เดือนที่ผ่านมาพอร์ตจ่ายทันหรือยัง" ซึ่งขยับทุกรอบที่ปิด). ผลตอบแทน/กรอบเวลาเป็นชิปในหน้า ไม่บันทึกลง DB และต้องพิมพ์กำกับว่าเป็นข้อสมมติ. ต้องรัน `sql/life_costs.sql`. |
| `ManageByPlatformScreen` | 986 | Portfolio | Group-by-platform bulk edit (move/refresh/delete) + multi-row bulk add. `UNASSIGNED = 'ไม่ระบุแพลตฟอร์ม'`. |
| `AddInvestmentScreen` | 985 | Portfolio (add + edit) | A different search backend per type (crypto / Thai stock / foreign / fund), live price on select, red-rule config. On **create** it joins the open cycle of its asset type; on **edit** it must pass `cycleId` back through or the whole-row update nulls it. |
| `PurchaseGoalsScreen` | 792 | Portfolio menu | **ปลดล็อกรางวัล** (เดิมชื่อ "ของที่อยากได้", เปลี่ยน 2026-08-20 — ผู้ใช้อยากได้ภาษาแนวเกม: คิวรางวัล / เพิ่มรางวัล / ปลดล็อกเมื่อกำไรถึง). Queue cards, funded by realized profit only (§6.3 — the mechanic did not change, only the words). |
| `AddExpenseScreen` | 663 | Home (×3) | Daily vs recurring mode (writes the `monthlyAmounts` grid). Receipt picker → Supabase storage. |
| `ManageCatalogScreen` | 652 | Profile; Portfolio | Usage counts block deleting in-use entries; live FX fetch; cascading rename via `catalogRename`. ค่าธรรมเนียมตั้งได้ **สองชั้น**: สกุลเงิน (ค่ามาตรฐานของตลาด, `sql/catalog_fee_by_currency.sql`) และแพลตฟอร์ม (`sql/user_platforms_fee.sql`) ซึ่งชนะเสมอถ้าตั้งไว้ — ลำดับอยู่ที่ `utils/tradeFee`. ขั้นต่ำของแพลตฟอร์มเลือกสกุลได้ด้วยชิป (IBKR $1). เว้นว่าง = *ยังไม่ตั้ง* ซึ่งบรรทัดในลิสต์ต้องแยกจาก *ฟรี* ให้ออก. |
| `AccountsScreen` | 415 | Profile; Portfolio | Account CRUD; pushes `ImportStatement`. |
| `AddIncomeScreen` | 405 | Home | Own header (`headerShown:false`); sets `pendingReturnDate`. |
| `StatisticsScreen` | 175 | Profile | Thin view over `utils/aiAnalysis`; imports no storage service. Restyled 2026-08-13 onto the shared card/`TEXT`/`COLORS` set — it was the last screen still carrying dark-theme hex backgrounds and emoji headings, and it was rendering `insight.icon` (an Ionicons name) as literal text. |
| `ImportStatementScreen` | 357 | Profile; Accounts | Paste → `statementParser` → classify → `importStorage.saveImportRows`. |
| `OverviewScreen` | 332 | Profile | Widest data fan-in: net worth + coverage + activity feed + the only two charts. |
| `IncomeScreen` | 318 | **unreachable** | Orphan route. |
| `SellReviewScreen` | 314 | Portfolio | Refetches live prices for already-sold symbols. |
| `PersonalInfoScreen` | 212 | Profile; TaxScreen | **Birth date only.** It feeds the 190,000 income exemption and the RMF age-55 clock, so it is not a deduction question; everything else moved to `TaxDeductionScreen`. |
| `AddInstallmentScreen` | 265 | Installments | Monthly amount derived from total/months, overridable. |
| `ProfileScreen` | 261 | ProfileTab | Route hub. **Reference implementation for `TEXT`/`FONTS` presets.** |
| `LoginScreen` | 213 | `Navigation` when `!user` | Google OAuth only; not a Stack route. |
| `InstallmentsScreen` | 188 | Profile; Home | Splits active vs completed by computed remaining months. |

### 7.3 Charts — `src/components/charts/` (Overview only)
No chart library; hand-rolled on `react-native-svg`.
- `MonthlyFlowChart` (115): paired in/out bars in **real measured pixels via `onLayout`** — never stretch the viewBox, `preserveAspectRatio="none"` distorts the rounded caps. Direct-labels only the worst overspend month.
- `CategoryBars` (81): horizontal because Thai category names are long; one color because categories are unordered; amounts outside the bar so short bars don't clip.

### 7.4 Buttons — `src/components/ActionButton.tsx`
ทุกอย่างที่กดได้แล้วมีข้อความต้องเป็นปุ่มที่เห็นขอบ/พื้น **ไม่ใช่ `Text` เปล่าใน `TouchableOpacity`** — เว็บไม่มี hover/underline ให้ ตัวหนังสือสีหลักจึงอ่านเป็นป้าย ไม่ใช่ปุ่ม (2026-08-19 กวาดทั้งแอปครั้งเดียว: ยกเลิก/ลบ ท้ายโมดัล 6 จุด · แก้ยอด/เริ่มก้อนใหม่ · เลือกทั้งหมด · เลือก/ยกเลิก/ลบ(n) ในหัวรายการหน้าหลัก · ดึงเข้ารอบ/ดูรายรอบ/ลบรอบ · ดูทั้งหมด · แก้ไข/เอากลับเข้าคิว · ลงไม้แล้ว·ปิดเตือน · เงื่อนไขการใช้สิทธิ์ · ปุ่มคัดลอกในตารางเดือน).

- 5 variant: `primary` (พื้นทึบ — หนึ่งใบต่อกลุ่ม) · `secondary` (ค่าเริ่มต้น ขอบเทา) · `danger` (ขอบแดง ไม่ใช้พื้นแดงทึบ) · `quiet` (ยกเลิก/ปิด) · `onDark` (บนหัวพอร์ตสีเข้ม). 2 ขนาด: `sm` ในการ์ด/หัวรายการ · `md` ในโมดัล/ท้ายฟอร์ม.
- ไม่ใส่ `label` = ปุ่มไอคอนล้วน (กลายเป็นจัตุรัสเอง). `disabled` **จางแต่ยังอยู่** — ปุ่มที่หายไปอ่านเป็นแอปเสีย (เหตุผลเดียวกับ `canAddLeg` §6.5) และปุ่มที่กดไม่ได้จะไม่มีทางบอกเหตุผล จึงมีที่ที่ยังปล่อยให้กดได้แล้วให้ `notify` อธิบาย (ปุ่มลบในหน้าจัดการสกุลเงิน/แพลตฟอร์ม).
- ปุ่มยืดเต็มแถวแล้วข้อความยาวต้องมี `flexShrink` ที่ตัวอักษร ไม่งั้นบนเว็บตัวหนังสือล้นกรอบ (ญาติของกฎ §1.4).
- ปุ่ม/ชิปเดิมในจอที่แก้ ถูกใส่ `RADIUS.sm/md` ให้เข้าชุดกับปุ่มใหม่ **ห้ามใส่ `fontWeight` คู่ `fontFamily`** (§1.2) และสีมาจาก `COLORS` เท่านั้น.
- ที่ยังเป็นตัวหนังสือโดยตั้งใจ: หัวข้อที่กดพับได้ (ชื่อรายการ + chevron), แถวเมนูที่พาไปหน้าอื่น (`MenuRow`/`navRow` — ทั้งแถวคือปุ่ม), ตัวเลือกเดือนบนหัวปฏิทิน, และการ์ดที่กดได้ทั้งใบ (หน้าผลงานที่ขายแล้วใช้ chevron เป็นตัวบอก).

### 7.5 มาสคอต — `src/components/Mascot.tsx`
"น้องหมุด" หมุดปักแผนที่มีหน้า — ชื่อแบรนด์คือ **ปักหมุด** ตัวการ์ตูนจึงเป็นหมุด ไม่ใช่กระปุกออมสิน/กระทิง.

- **วาดด้วย `react-native-svg` ล้วน ไม่ใช่ไฟล์ภาพ** (ชุดเดียวกับกราฟ §7.3): สีมาจาก `COLORS`, ย่อขยายได้ไม่แตก, ไม่มี request.
- **ห้ามใส่ `<Text>` ของ SVG** — ฟอนต์ไทยจาก expo-font ไม่ถูกใช้กับ SVG text บนเว็บ (ญาติของ §1.2) ทุกอย่างจึงเป็นรูปทรง. "zzz" ตอนหลับจึงเป็นฟองกลม ไม่ใช่ตัวอักษร.
- **สองแกน**: `stage` (1–5, ค่าเริ่มต้น **2**) คุม **สีตัว · ขนาด · แขน · ของประดับ** = "มาไกลแค่ไหนแล้ว" · `state` (5 อารมณ์ `happy | cheer | sleep | alert | sad`) คุม **หน้า + สีของประกอบรอบตัว** = "ตอนนี้เป็นยังไง".
- **สีตัวย้ายจากอารมณ์ไปเป็นของขั้น (2026-08-20 เจ้าของเลือกเอง)** — เดิมสีตัวคือสถานะ (เทา = ไม่มีอะไรทำ · แดง = มีสัญญาณ) พอย้าย สัญญาณจึงต้องมีที่ยืนใหม่: **ของประกอบรอบตัวใช้สีอารมณ์** (`alert` = คลื่นแดงสองข้าง · `cheer` = ประกายเขียว · `sleep` = ฟองเทา) บวกกับหน้าที่แยกกันได้อยู่แล้วโดยไม่ต้องพึ่งสี. **ผลข้างเคียงที่ต้องรู้: จอว่าง (`sleep`) ไม่เป็นสีเทาอีกแล้ว** เป็นสีของขั้นปัจจุบัน — ถ้าจะเอาเทากลับ แก้ที่ `STAGES[n].body` ทางเดียว.
- **ขั้นการเติบโต (2026-08-20)**: 1 เล็ก/น้ำเงินอ่อน/ไม่มีแขน · 2 น้ำเงิน+แขน · 3 +วงทองรอบหน้า · 4 **เขียวอมน้ำเงิน**+มงกุฎ · 5 **ตัวทอง**+ออร่า+ประกาย. ขั้น 5 ตัวเป็นทองแล้ว ของประดับจึงสลับไปใช้ `COLORS.accentText` (ทองเข้ม) ไม่งั้นจมหายไปกับตัว. **ยังไม่มีอะไรส่ง `stage` เข้ามา** — รอระบบเลเวล. ⚠️ เกณฑ์เลื่อนขั้นต้องมาจากของที่ **ขึ้นอย่างเดียว** (เลเวลที่ผ่าน · รอบที่ปิด · ไม้สะสม) **ห้ามผูกกับมูลค่าพอร์ต** ไม่งั้นตลาดลงทีน้องหมุดโดนลดขั้น = ลงโทษคนที่ทำถูกและผลักให้ขายตอนไม่ควรขาย.
- **มิติ**: ไล่เฉดในตัว (radial) + ขอบเข้ม + ไล่เฉดในวงหน้า + ไฮไลต์ในตา 2 จุด. ทุกเฉดมาจาก `shade()` ที่ผสม `COLORS` กับขาว/ดำ — **ไม่มีสีใหม่เข้าระบบ**. id ของ gradient มาจาก `useId()` ต่อ instance — ใช้ id คงที่ไม่ได้ เพราะบนเว็บมาสคอตตัวที่สองจะไปดูด gradient ของตัวแรก.
- **`viewBox` คือ `-5 -7 74 82`** (เผื่อขอบให้มงกุฎ/ออร่า/แขนของขั้นสูง) ตัวจึงเล็กลง ~12% ที่ `size` เท่าเดิม — จุดที่เป็นภาพหลัก (login/จอโหลด/`MascotEmpty`) ดัน `size` ชดเชยไว้แล้ว.
- **สัดส่วน "น่ารัก" (ปรับ 2026-08-20)** — baby schema สี่ข้อ: วงหน้าใหญ่ (r18 ในหัว r24.5) · ตาโตขึ้นเกือบเท่าตัว (2.6 → 3.9) และ **ย้ายลงต่ำกว่ากลางวงหน้า** (y26.5) · **ไฮไลต์จุดขาวในตา** (ให้ผลมากที่สุด — เปลี่ยน "รูดำ" เป็น "ตาที่มีชีวิต") · แก้มชมพู + ปากเล็กลง. แก้มไม่ใช่สีใหม่ เป็น `COLORS.error` ที่ opacity 0.3.
- **สามกับดักที่เจอตอนเรนเดอร์จริง ไม่ใช่ตอนอ่านโค้ด** (ตรวจที่ 150 / 56 / 40 / 22px): **ปลายหมุดต้องยาวถึง y66** — แบบปลายทู่ (y63) น่ารักกว่าตอนใหญ่ แต่พอย่อเหลือ 22px เงากลายเป็นก้อนกลม อ่านไม่ออกว่าเป็นหมุด (favicon อยู่ที่ 16px) · ประกายของ `cheer` ถ้าเป็น "ขีดเฉียง" ข้างหัวจะอ่านเป็น **หนวด/เขา** ต้องเป็นจุดและอยู่นอกวงหัว (รัศมี 24.5 จาก 32,26.5) · คิ้วของ `sad` ถ้าเอียงกลับด้าน (ปลายในต่ำ) จะกลายเป็น **หน้าโกรธ** ทันที.
- **ใช้เป็นตัวบอกสถานะ ไม่ใช่ของประดับ** — อารมณ์ต้องมาจากตัวเลขที่การ์ดนั้นพิมพ์อยู่แล้ว: `PurchaseGoals` ใช้ `mascotFor(pending, unlocked, realized)` · หัวพอร์ตใช้กำไร/ขาดทุนรวม (`portfolioMood`, พอร์ตว่าง = `sleep` ไม่ใช่ `sad`) · `DryPowder` ใช้สถานะกระสุน (`powderMood`: ไม้หมด = `alert`, ลงเกินแผน = `sad`) · การ์ด "ถึงคิวลงไม้" ตอนเช็คแล้วไม่เจอสัญญาณ.
- **บนพื้นเข้มต้องส่ง `tone`** — หัวพอร์ตเป็น `COLORS.primary` สีตัวปกติจึงจมพื้นหายไปทั้งตัว ใช้ `tone={COLORS.accent}` (ทอง) แทน.
- **`MascotEmpty` คือจอว่างมาตรฐานของทั้งแอป** (มาสคอต + ข้อความกึ่งกลาง): `Portfolio` (พอร์ตว่างทั้งพอร์ต) · `Realized` · `SellReview` · `Cycles` · `PurchaseGoals` · `RedSignals` · `Installments` · `Accounts` · `Overview` · `ManageByPlatform` · `DryPowder`. **ห้ามใช้กับช่องว่างรายวัน/ผลของตัวกรอง** ("วันนี้ยังไม่มีรายจ่าย", "ไม่พบรายการที่ตรงกับตัวกรอง") — พวกนี้โผล่ทุกวันจนมาสคอตกลายเป็นสัญญาณรบกวน.
- **แบรนด์**: `LoginScreen` (แทน `assets/icon.png` 344KB ที่เคยโหลด) และจอโหลดสองด่านใน `navigation`. โลโก้ตัวหนังสือบนไซด์บาร์/แถบบนมือถือยังเป็น `brand-pakmutwealth-mark.png` เหมือนเดิม — มาสคอตไม่มีชื่อแบรนด์ในตัว จึงแทนโลโก้ตรงนั้นไม่ได้.
- **ไอคอนแอปใช้ทรงแบน ไม่ใช่ทรงมีมิติ** — ที่ 16px ไล่เฉดกับแขนกลายเป็นสัญญาณรบกวน ไอคอนจึงหยุดที่หน้าน่ารัก + ตัวหมุดทึบ และ **ต้องนิ่ง ไม่เปลี่ยนตามขั้น** (คนจำแอปจากไอคอน).
- **ไอคอนแอปทุกไฟล์สร้างจากมาสคอตตัวนี้** (2026-08-20): พื้น `#294E80` + ตัวหมุดสีทอง `#D6B35A` สูง 62% ของกรอบ (เขตปลอดภัยของไอคอนแบบ maskable). ไฟล์ที่ทับไปแล้ว: `assets/icon.png` · `assets/favicon.png` · `assets/adaptive-icon.png` + `assets/splash-icon.png` (พื้นโปร่ง คู่กับ `backgroundColor: #0D1B2A` ใน `app.json`) · `public/favicon.ico` (ICO ห่อ PNG 32px) · `public/favicon.svg` (**637KB raster → 619 ไบต์**) · `favicon-96x96` · `apple-touch-icon` · `web-app-manifest-192/512`. เรนเดอร์ด้วย Playwright จากหน้า HTML หน้าเดียว — **ไม่มีสคริปต์นี้ในรีโป** ถ้าต้องสร้างใหม่ให้วาดจากพิกัดชุดเดียวกับ `Mascot.tsx`.

---

## 8. Data model

Tables → owner: `expenses` + `recurring_bills` (`storage`), `incomes` (`incomeStorage`), `investments` + `transactions` (`investmentStorage`), `realized_trades` (`realizedStorage`), `tax_profiles` (`taxStorage`), `user_profile` (`userProfileStorage`), `activity_log` (`activityLogStorage`), `investment_cycles` (`cycleStorage`), `red_signals` (`redSignalStorage`), `life_costs` (`lifeCostStorage`), `life_goals` (`lifeGoalStorage`), `life_ledger` (`lifeLedgerStorage`), `investment_plan` + `portfolio_goals` (singletons), `purchase_goals`, `installment_plans`, `accounts`, `account_transfers` (written only by `importStorage`), `user_currencies`, `user_platforms`, `telegram_pending` (edge fn only).

`investments.cycle_id` and `realized_trades.cycle_id` are the only cross-table links added by hand (nullable, no FK — a deleted cycle must not cascade into deleting positions or history). Both ride their table's optional-column fallback, so the app still works before `sql/investment_cycles.sql` is run.

**jsonb columns — changing the shape needs a mapper change, no SQL:**

| Column | TS type | Owner |
|---|---|---|
| `tax_profiles.months` | `TaxMonth[]` (always 12) | `taxStorage` |
| `tax_profiles.deductions` | `DeductionMap` (keys = `DEDUCTION_ITEMS`) | `taxStorage` |
| `tax_profiles.year_facts` | `TaxYearFacts` | `taxStorage` |
| `tax_profiles.gain_rules` | `Partial<Record<InvestmentType, GainTaxRule>>` | `taxStorage` |
| `realized_trades.source_investment` | `Investment` (pre-sale snapshot, powers undo) | `realizedStorage` |
| `investment_plan.dry_powder_items` | `DryPowderItem[]` | `investmentPlanStorage` |
| `recurring_bills.monthly_amounts` | `{ 'YYYY-MM': number }` | `storage` |

`sql/` (21 files, idempotent, hand-run): `activity_log` · `catalog_currencies_platforms` · `investment_cycles` · `investment_plan_dry_powder` · `investment_plan_leg_sizing` · `investments_red_rule` · `investments_red_ack` · `purchase_goals` · `red_signals` · `life_costs` · `life_goals` · `life_ledger` · `realized_trades` + `realized_trades_undo` · `tax_profiles` · `tax_deductions` · `tax_year_facts` · `user_platforms_fee` · `catalog_fee_by_currency` · `user_profile`. `investment_cycles` wraps its `realized_trades` alter in a `to_regclass` guard so the file still runs on a database where that table doesn't exist yet. Each `create table` file also sets RLS + the four own-row policies — **copy that block when adding a table.** The base tables (`expenses`, `investments`, `investment_plan`, `telegram_pending`) have **no committed SQL**; they predate the convention.

Type notes: **`Currency = string`**, deliberately not a union, since users manage the catalog (`DEFAULT_CURRENCIES` is seed data). `InvestmentType = stock_th | stock_foreign | fund | crypto | gold | other`. `RealizedTrade.fees` is THB while `buyPrice`/`sellPrice` are in `currency` — an intentional asymmetry mirrored in `realizedAnalysis` and `taxCalc`.

---

## 9. Telegram bot — `supabase/functions/telegram-bot/`

Deno edge function (its 8 TS errors under the app tsconfig are expected). Single-user receipt ingestion: webhook POST → photo → **Gemini `gemini-2.5-flash`** OCR with a Thai prompt (`temperature: 0`, thinking off) → `{amount,date,time,description,category}` → row in `telegram_pending` (`scanning` → `ready`/`need_category`/`failed`); `/done` shows a confirm keyboard, confirming inserts into `expenses`.

Uses the **service-role client, so it bypasses RLS** — `APP_USER_ID` scopes the rows. Secrets from `Deno.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`, `APP_USER_ID`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Deploy is a manual `supabase functions deploy telegram-bot`; no config.toml, no CI, webhook registration isn't in the repo. Logs raw Telegram payloads. **This is the only LLM call in the project** — no AI SDK in `package.json`, no model call in the app.

---

## 10. Known rough edges

Context so you don't "discover" them twice — not bugs to fix on sight. The per-module traps already live in §4.1; these are the rest.

- **Committed secret:** `api/twelve-data.js` `FALLBACK_KEY`. Rotate the key and delete the fallback once the Vercel env var is set.
- **Dead code:** all of `takeProfit.ts`; `holdingAnalysis.getYearsToTarget`; most of `investmentGoals`' annuity solvers; `constants.INVEST_EXPENSE_CATEGORY` (documented, referenced nowhere — so the "exclude investment transfers from the budget card" rule is unenforced); `activityLogStorage`'s readers; the `IncomeScreen` route; the `transactions` table has no writer.
- **Dead deps:** `react-native-paper`, `react-native-vector-icons`, `concurrently`. `babel-preset-expo` is declared **twice with conflicting majors** (`~54.0.10` deps, `^55.0.18` devDeps).
- **Empty `mt5_backend/` husk** on disk (gitignored, zero files) — a Windows file lock blocked deletion. No MT5 code in `src/`.
- Four names for one app: `narix` (Expo slug — **must stay**, the OAuth deep link depends on it), `wealth-lab` (Vercel + repo dir), `Pakmut Wealth` (brand), `tracking` (`package.json#name`, leftover, nothing reads it).
- `README.md` still advertises `narix.vercel.app`; the live origin is `wealth-lab-omega.vercel.app`. Don't copy the URL out of the README.
