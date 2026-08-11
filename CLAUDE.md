# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Read **§0 and §1 always**. Everything after §3 is reference — jump to the section that owns the file you're about to touch.

---

## 0. TL;DR

| | |
|---|---|
| **What** | "Pakmut Wealth" (repo/project name `wealth-lab`, Expo slug `narix`) — personal finance + investment tracker. UI is **Thai**. |
| **Stack** | Expo 54 / React Native 0.81 / React 19 → **shipped as a web SPA on Vercel**. Same codebase targets iOS/Android but native is not configured (no bundle ids). |
| **Backend** | Supabase (Google OAuth + Postgres + RLS). No server of our own except two Vercel serverless proxies in `api/`. |
| **Correctness gate** | `npx tsc --noEmit`. **There is no test runner and no linter.** |
| **Two hard render gates** | fonts (`App.tsx`) → auth + FX-rate cache (`src/navigation/index.tsx`). Both return `null`/spinner until ready. |
| **State** | No global store. Every screen re-reads its storage service in `useFocusEffect`. |
| **Removed, don't reintroduce** | MT5 grid trading, the in-app AI assistant (`aiService`/`AIAssistant`), `react-native-iconify`. |

Scale to expect: `src/screens/PortfolioScreen.tsx` is **3005 lines**, `HomeScreen.tsx` 1935. Read the section for a screen before opening it.

---

## 1. Rules that break the app if ignored

These are ranked by how often they've already caused a bug.

1. **Both mappers or the field vanishes.** DB is snake_case, TS is camelCase. Every `*Storage.ts` has `mapXFromDb`/`mapXToDb`. Add a field to a type → add it to **both**, or it silently drops on save *and* load. (`investmentPlanStorage` and `portfolioGoalStorage` map inline instead of via named functions — same rule, two inline blocks.)
2. **Never pair `fontWeight` with `fontFamily`.** Web fake-bolds an already-weighted font file. Pick the weight by choosing the file: `NotoSansThai_300Light/_400Regular/_500Medium/_600SemiBold` (SemiBold is the heaviest loaded). Every `Text`/`TextInput` must set a family explicitly or the system font leaks in.
3. **No desktop max-width, ever.** `DESKTOP_MAX_WIDTH`/`DESKTOP_CONTENT_MAX_WIDTH` were deliberately deleted from `useResponsive()` and from all 16 screens. A sparse wide layout is fixed by **adding columns**, never by capping width. Only overlays (modal cards 400–500px, the login card) may be width-capped.
4. **`TextInput` in a flex row needs `minWidth: 0`** on top of `flex: n`. On web it's an `<input>` whose intrinsic ~20-char width becomes its automatic minimum, so `flexShrink` can't shrink it. Measured: two inputs at `flex: 3`/`flex: 2` in a 279px card each stayed 192px — 141px of overflow. Native never shows this; only the deployed web app does.
5. **Don't gate "stack vertically" on `isMobile`.** The 768–1023 tablet band is neither `isMobile` nor `isDesktop`, so those rows stay side-by-side and get crushed. Branch on `!isDesktop`.
6. **Every `Modal` card is a `ScrollView`** with `maxHeight: '100%'` + `flexGrow: 0`, padding on `contentContainerStyle`. `public/index.html` sets `body { overflow: hidden }` — a too-tall modal doesn't just look bad, its save button becomes unreachable.
7. **Locking a card to a pixel width also needs `flexBasis`.** `flex: 1` compiles to `flex: 1 1 0%` on react-native-web and `flex-basis: 0%` beats `width` — set `width` alone and the card collapses to zero.
8. **Browser-blocked APIs must go through `api/*.js`.** Yahoo Finance, Frankfurter and metals.live send no `Access-Control-Allow-Origin`. They work from curl/Node and fail with a silent `"Failed to fetch"` in a real browser. **Verify price/network changes in a headless browser (Playwright), never curl** — curl cannot reproduce CORS.
9. **Never put an API key back into client code.** `TWELVE_DATA_API_KEY` lives in the Vercel env, read by `api/twelve-data.js`. Anything in `src/` ships in the browser bundle.
10. **Dialogs go through `utils/dialog.ts`** (`notify`, `await confirmAsk`). `react-native-web` silently no-ops `Alert.alert` with buttons. Don't hand-roll `window.confirm` in a screen again. Icons: `@expo/vector-icons` (Ionicons) only. Colors: `COLORS` in `utils/constants.ts` only.
11. **Don't make `refreshCurrencyCache()` fire-and-forget.** See §5.2 — totals paint with hardcoded fallback rates and stay wrong until remount.
12. **Thai everywhere.** New user-facing strings and code comments in Thai, to match. Dates with year > 2400 (Buddhist era) go through `toChristianYear()`.
13. **Never declare a component inside a screen's render body.** A wrapper defined in the function body (`const Section = ({...}) => ...`) is a *new component type* on every render, so React unmounts and remounts its whole subtree — every `TextInput` inside loses focus after the first keystroke and the screen becomes unfillable. This shipped in `TaxScreen` and made the entire tax form impossible to type into. Hoist to module scope and pass state down as props (`Section` there is the reference fix).

---

## 2. Commands

```bash
npm run web              # expo start --web  (npm run dev = same; npm run react = same on port 8081)
npm run start            # expo start (pick platform)
npm run ios / android    # native dev (bundle ids are NOT configured)
npx tsc --noEmit         # the only test. Run before every commit.
npx expo export --platform web   # prod web build → dist/  (this is Vercel's buildCommand)
```

**Expected typecheck state:** app code is clean; the only errors are the 8 in `supabase/functions/telegram-bot/index.ts` (Deno globals under the app tsconfig). Anything else is yours.

### Deploy
```bash
git push origin main
vercel --prod --scope thehearttoonas-projects --yes   # may exceed a 2-min tool timeout; re-run if so
```
`vercel.json` is three lines: `buildCommand`, `outputDirectory: dist`, and an SPA rewrite `"/((?!api/).*)" → "/"` (everything except `/api/*`). Vercel project name is **`wealth-lab`**; `src/services/priceApi.ts:42` hardcodes `https://wealth-lab-omega.vercel.app` as `PROD_API_ORIGIN` — that constant is what local dev and native fall back to, so **local dev hits the production proxies**.

**Schema changes are applied by hand** in the Supabase SQL editor. There is no `migrations/` dir. When you add a column, hand the user an idempotent `alter table ... add column if not exists ...`, and put it in `sql/`.

---

## 3. Repo map — where to look

| Path | Owns | Open it when |
|---|---|---|
| `App.tsx` | Font gate + provider tree (Gesture → SafeArea → Navigation) | changing boot order |
| `src/navigation/index.tsx` (401) | All routes, both layouts, auth + FX gates | adding a screen/route |
| `src/screens/*.tsx` (19) | All UI | §7 lists every one |
| `src/services/*.ts` (18) | Supabase I/O + external APIs | §4 |
| `src/utils/*.ts` (16) | Pure domain logic, all the business rules | §6 |
| `src/types/*.ts` (5) | Shapes + the tax/gain constant tables | before changing any stored shape |
| `src/components/charts/` (2) | Hand-rolled SVG charts (no chart lib) | Overview screen visuals |
| `src/hooks/useAuth.ts` | Supabase session/user/loading/signOut | |
| `api/*.js` (2) | Vercel CORS proxies: `yahoo-quote`, `twelve-data` | §5.1 |
| `sql/*.sql` (7) | Hand-run schema, idempotent | §8 |
| `supabase/functions/telegram-bot/` | Deno edge fn, Telegram receipt OCR via Gemini | §9 |
| `public/funds.json` | 3,031 Thai funds (494 KB), lazily fetched | fund search |

**Stale docs — do not trust:** `README.md` (pre-pivot expense-tracker copy: claims Gemini slip-reading in-app, dark mode, omits the whole investment side) and `.github/copilot-instructions.md` (claims "no backend required", AsyncStorage-only). **CLAUDE.md is the accurate document.**

---

## 4. Storage layer

Every data domain is a `src/services/*Storage.ts` wrapping Supabase. Match these conventions when adding one.

**Universal facts:**
- `getUserId()` lives in `services/supabase.ts` — import it, never re-declare. It calls `auth.getUser()` on **every write** (not memoized).
- Reads are bare `.select('*')` with **no `.eq('user_id', …)`** — row isolation is 100% **RLS**. Writes attach `user_id` because RLS `WITH CHECK` requires it. Deletes are `.eq('id', …)` only.
- Supabase URL + publishable key are **hardcoded** in `services/supabase.ts` (public anon key, RLS-protected — intentional). The `.env` file with `EXPO_PUBLIC_SUPABASE_*` is dead config; nothing reads it.
- **No offline cache, no local mirror.** AsyncStorage is used only for the auth session.
- Three recurring patterns worth recognizing:
  - **Optional-column fallback** (`investmentStorage`, `investmentPlanStorage`, `realizedStorage`): on write failure, strip the column named in the Postgres error and retry. Matching is substring-based (`new RegExp(col,'i')`), i.e. fragile. It exists because users may not have run the newer `sql/` files.
  - **Table-missing tolerated** (`currencyStorage.isCatalogTableMissing`, `taxStorage.isTaxTableMissing`, `purchaseGoalStorage.isPurchaseGoalTableMissing`, `catalogRename.ignoreMissingTable`): same reason.
  - **Per-user singleton**: `.maybeSingle()` + `upsert` (`investment_plan`, `portfolio_goals`).

### 4.1 The modules

| Module | Table(s) | Shape | Must know |
|---|---|---|---|
| `storage.ts` | `expenses`, `recurring_bills` | lists | Despite the generic name it is **expenses + recurring bills only**. Expenses have **no mapper** (written raw). `recurring_bills.monthly_amounts` is a **jsonb** map `YYYY-MM → amount`; `bill.amount` is only a reference placeholder, `dueDay`/`isActive` are legacy. |
| `incomeStorage.ts` | `incomes` | list | **No mappers** — the TS shape is written raw. `getIncomesByMonth` uses `.like('date','YYYY-MM%')`, a string prefix match, so it depends on the stored date format. Exports `INCOME_CATEGORIES`. |
| `investmentStorage.ts` (261) | `investments`, `transactions` | lists | `setRedAck()` patches **only `red_ack_count`/`red_ack_streak_at`** (same reason as `updateInvestmentPrices`: the caller is a summary card holding possibly-stale row data). Needs `sql/investments_red_ack.sql` — it throws a "go run the SQL" message instead of failing silently, because a snooze button that looks dead is worse than an error. `updateInvestmentPrices()` patches **only `current_price`** in parallel — never replace it with per-item `updateInvestment`, which would overwrite concurrent edits with stale rows. Deleting an investment requires deleting its `transactions` **first** (no assumed cascade), non-transactional. `getPortfolioSummary()` **swallows all errors and returns zeros** — a network failure looks like an empty portfolio. `summarizeInvestments()` converts prices via `convertToTHB` but adds `fees` unconverted (fees are assumed THB). |
| `realizedStorage.ts` | `realized_trades` | list, insert/delete only | Deliberately **no FK to `investments`**: when a position is fully sold the investment row is deleted but the history must survive. `mapToDb` omits `platform`/`source_investment`; they're bolted on after and go through the optional-column retry — so **a save can succeed while silently dropping the undo snapshot**. Needs `sql/realized_trades.sql` + `..._undo.sql`. |
| `taxStorage.ts` (130) | `tax_profiles` | list keyed by year, `upsert(onConflict:'user_id,year')` | See §6.1 — `months` jsonb is the source of truth; the scalar columns are derived, write-only, and lossy. Has a **legacy migration on every read** that fabricates per-month values from old yearly scalars. |
| `investmentPlanStorage.ts` | `investment_plan` | singleton | Returns `null` if `salary_set_aside_percent` **or** `dca_rounds` is null — a row holding only dry-powder data reads back as "no plan". `dry_powder_items` is jsonb; the scalar `dryPowder` must equal `sumDryPowderItems(items)`, which calls `convertToTHB` and therefore depends on the FX cache being warm. |
| `portfolioGoalStorage.ts` | `portfolio_goals` | singleton (plural name) | The `PortfolioGoal` type lives in **`utils/investmentGoals.ts`**, not `types/`. |
| `purchaseGoalStorage.ts` | `purchase_goals` | list | `reorderPurchaseGoals` does **one UPDATE per id** on purpose (a bulk upsert would null unsent columns) — O(n) round-trips, non-atomic. `getPurchaseGoals` **throws** on missing table; callers must apply `isPurchaseGoalTableMissing` themselves. Needs `sql/purchase_goals.sql`. |
| `installmentStorage.ts` | `installment_plans` | list | Ordered by `start_month desc` (a `YYYY-MM` string, lexicographic). |
| `accountStorage.ts` | `accounts` | list | `Account.platform` links a `reserve` account to `investment.platform` — that link is what makes §6.4 net-worth math work. |
| `currencyStorage.ts` | `user_currencies` | list | **Side-effect module**: `refreshCurrencyCache()` pushes into the module globals behind `convertToTHB` (§5.2). Returns `[]` (not throw) when the table is missing. `seedDefaultCurrencies()` seeds `DEFAULT_CURRENCIES`. |
| `platformStorage.ts` | `user_platforms` | list | Imports `isCatalogTableMissing` **from `currencyStorage`**. `seedDefaultPlatforms(extra)` merges names harvested from existing investments/accounts, de-duped case-insensitively. |
| `catalogRename.ts` | `investments`, `accounts`, `realized_trades` | — | Currency/platform are stored as **raw strings, not FK ids**, so a rename must fan out. `renameCurrencyEverywhere` hits 3 tables; **`renamePlatformEverywhere` hits only 2 — it never updates `realized_trades.platform`** (known gap). Non-transactional. |
| `importStorage.ts` | `expenses`, `incomes`, `account_transfers` | — | The **only** writer of `account_transfers`. Dedup key is `date|amount|description.slice(0,24)` — a truncated description, so two genuinely distinct same-day/same-amount rows collide and the second is silently skipped. `getExistingKeys` ignores read errors, so a failed read means everything looks new. |
| `fundCatalog.ts` | none | — | Module-level cache + in-flight dedupe over `/funds.json`, fetched **once per page load**. On fetch failure the shared promise resolves `[]` while `cache` stays null → **fund search is dead until reload**. Root-relative URL, so web-only. |
| `priceApi.ts` (685) | none | — | §5.1. |
| `pendingNavigation.ts` | none | — | 5 lines, a module-level global used as a nav side channel: Add-Expense/Add-Income set the date they just edited, HomeScreen reads + clears it on focus to re-select that day. Not persisted. |

---

## 5. External data

### 5.1 Prices — `services/priceApi.ts` + `api/*.js`

Sources: **Binance** (crypto, primary) → **CoinGecko** (fallback, `CRYPTO_ID_MAP` ≈55 symbols); **Twelve Data** (stocks, via proxy) → **Yahoo** (fallback, via proxy); **Yahoo `GC=F`** for gold (USD/troy-oz → USD per baht-tong: `/31.1035*15.244`); **open.er-api.com** for FX.

- **Thai stocks skip Twelve Data entirely** (free tier 404s on SET) and go straight to Yahoo. For a dotless symbol Yahoo is tried as `SYM.BK` **first**, then bare `SYM` — bare `PTT` matches a US fund.
- `exchangeRateCache` is module-level, 1-hour TTL, USD-based (cross rates by division). On failure it returns a hardcoded table and does **not** cache it — callers cannot tell real from fallback.
- `readJson()` returns null unless the content-type says json — guards against Metro serving `index.html` with HTTP 200.
- `fetchPricesForItems()` is the batch entry point: crypto batched per currency (Binance 400s the whole batch if one pair is unlisted → those are retried individually), one gold fetch per currency fanned out, stocks through `mapWithConcurrency` at `STOCK_CONCURRENCY = 4` (Twelve Data free tier is 8 req/min, 800/day). It **records only prices > 0**; failures are simply absent from the map.
- `getTwoRedDays()` always **drops still-open candles** before counting a red streak — otherwise today's in-progress candle fakes a signal. Returns `{count:0,met:false}` for "rule active, not yet due" vs `null` for "unsupported/unfetchable"; the UI distinguishes these. It also returns `streakStartAt` (open time of the streak's first bar, ms) — that is what tells one streak from the next, see `utils/redAlert.ts`; if you slice `opens/closes/lows` you must slice `times` with them.
- Nearly every network path `console.error`s and returns `null`/`[]`. **No error propagates to callers.**
- **Fund NAV has no live API.** SEC Open Data's NAV endpoint is impractical (oldest-first, 100/page, no latest filter). Hence the static `public/funds.json` catalog + manual NAV entry. `isPriceRefreshable('fund')` is false.
- `api/yahoo-quote.js` is the template for a new proxy: validates params, sets a `User-Agent`, adds `Access-Control-Allow-Origin: *`, 502s on upstream failure. `api/twelve-data.js` allowlists `endpoint ∈ {quote, symbol_search}` and reads `TWELVE_DATA_API_KEY`; **it still carries a committed `FALLBACK_KEY` for when the env var is unset — that key should be rotated and the fallback deleted.**

### 5.2 The two currency systems — read this before reconciling any total

| | `utils/constants.ts#convertToTHB` | `priceApi.ts` |
|---|---|---|
| Rates | **user-set** (`user_currencies.rate_to_thb`) | **live** (open.er-api.com) |
| Used by | every screen total, `getPortfolioSummary`, all of `src/utils/*` | price fetching only |
| Sync? | **No** — the two will disagree | |

`convertToTHB` must be callable **synchronously during render**, so it can't await Supabase. Instead it reads two module-level objects seeded with defaults (`THB 1, USD 35, EUR 38, JPY 0.24, CNY 4.8`), which `currencyStorage.refreshCurrencyCache()` overwrites via `setCurrencyCatalog()`.

Consequences, all deliberate:
- **`Navigation` blocks render on `refreshCurrencyCache()`** (`currencyReady` state). Nothing re-renders when rates land, because it's a module global not React state — so if you turn this back into a fire-and-forget `useEffect`, every total paints with USD=35 and stays wrong until the screen remounts.
- `setCurrencyCatalog` **forces `rates.THB = 1`** after merging user input. Without it, a user typing a THB rate rescales the entire app.
- Only `typeof number && > 0` rates are accepted; unknown currencies fall back to `1` (treated as THB) rather than `NaN`. `hasCurrencyRate()` exists purely so the catalog screen can warn about that 1:1 assumption.
- `refreshCurrencyCache` swallows its own errors — a failed fetch degrades silently to defaults.

---

## 6. Domain logic — `src/utils/`

Pure functions, no React. **This is where the product's judgment lives**; most of these files are 60% guard clauses, and each guard exists because its absence produced a confidently wrong number.

Cross-file: `MS_PER_YEAR = 365.25*24*3600*1000` and `MIN_YEARS(_FOR_ANNUALIZED) = 0.25` are **duplicated in `holdingAnalysis`, `realizedAnalysis`, `investmentGoals`**, each commented as intentionally matching the others. Change one and they silently desync.

### 6.1 Tax — `utils/taxCalc.ts` (279) + `types/tax.ts` (179)
Thai personal income tax (ภ.ง.ด.90/91) estimator. Brackets, the 50%-capped-at-฿100k salary expense, the ฿60k personal allowance, the ฿9k social-security cap and the per-asset capital-gains rules are all **data in `types/tax.ts`**, not `if`s, so they can be edited per year.

- **Salary/bonus/withholding/social-security live in `TaxProfile.months` — 12 rows in a jsonb column.** The scalar columns (`monthly_salary`, `salary_months`, …) are derived and written **for console readability only; never read back for calculation.** `monthly_salary` is a rounded average, i.e. lossy.
- **Deliberately NOT read from `incomes`.** The tax screen owns its own numbers so there is never a second source of truth for the same fact. "เติมจากรายรับ" is an explicit one-time prefill, not a live link.
- **Monthly entry does not make tax more accurate** — Thai PIT is assessed on the annual total (`40k×6 + 45k×6` = `42.5k×12`). Monthly exists for per-month withholding, mid-year raises, and separating "actual so far" from "projected".
- **Never show a partial-year total as the annual estimate.** Brackets are non-linear: 8 months of ฿50k run straight through gives ฿4,200 vs ฿20,600 actual (~5× low). `calculateTax` returns `filledMonths`; `projectFullYear()` returns a *separate* projection (missing months filled from the last filled month, **bonus forced to 0** since it isn't monthly). The screen shows them as two distinct cards. A previous version overwrote `salaryMonths` with "months that have data" and produced exactly this bug.
- **Losses clamp at 0 per asset type** — Thai law gives individuals no loss carry-forward against salary, so a losing crypto year must not reduce tax on wages.
- **Gain tax is a difference, not `gain × marginalRate`** — a large gain spans brackets. `estimateGainTax` literally runs `calculateTax` twice (with and without the gain injected as `otherIncome`) so the sell form, the portfolio card and the tax screen can never disagree.
- `taxYearOf()` round-trips through `toChristianYear` then adds 543, so grouping is always BE regardless of how the date was stored.
- **Social-security limits are keyed by tax year** (`socialSecurityLimits(year)` over `SOCIAL_SECURITY_BASE_STEPS`): base cap 15,000→**17,500 from BE 2569**, 20,000 from 2572, 23,000 from 2575, so the monthly max goes 750→875→1,000→1,150 and the annual deduction cap 9,000→10,500→12,000→13,800. The screen lets you pick past years, so never collapse this back to one constant.
- **Known gaps:** `extraDeductions` is one lumped field — no per-item caps (RMF 500k, SSF 200k, retirement group 500k, spouse/children/parents, insurance), no donation 10%/2× base, no dividends or dividend tax credit. Brackets and allowances (unlike the social-security caps) are still single constants, not keyed by tax year.

### 6.2 Sell review — "ทบทวนการขาย" (`utils/sellReview.ts`, 179)
Answers "would I have done better holding?" by comparing each `realized_trades` row's sell price against today's price, then prescribing a sell rule **empirically** rather than by guess: mostly-sold-too-early → trailing stop / scale out; mostly-well-timed → don't bolt on an automatic rule. Needs no new user input.

Guards that must not be removed:
- Sales newer than `MIN_DAYS_TO_JUDGE` (**30**) are `too_recent` — excluded from the counts **and** the money totals. Checked *before* the flat band, so recency always wins.
- A ±`FLAT_BAND_PERCENT` (**3%**) band is `flat` — smaller moves are daily noise, not skill.
- Fewer than `MIN_TRADES_FOR_DIAGNOSIS` (**3**) judged trades → `not_enough_data`. Never diagnose a habit from one or two trades.
- `sells_too_early` requires **both** ≥0.6 of judged trades **and** `netTHB > 0` — count and money must agree.
- **Median, not mean**, for `sinceSellPercent`.
- Thai funds have no price API → `unknown`. The screen always prints how many trades fell out of the conclusion.
- `priceKeyOf = type:SYMBOL:currency` — same ticker in another currency is a different key, since the price is compared directly against a sell price denominated in that currency. Prices are fetched once per key, not per trade.
- The screen must state the hindsight caveats on-page: today's price is one point in time; the proceeds were redeployed (so this is opportunity cost, not proof of a mistake); tax/fees aren't deducted.

### 6.3 Purchase goals — "ของที่อยากได้" (`utils/purchaseGoals.ts`)
A wishlist gated on trading performance: an item priced X unlocks only once **realized** profit reaches `multiplier × X` (default 10, presets 3/5/10/20).
- **Realized only** (`summarizeRealized(trades).totalPnlTHB`). Unrealized profit unlocks nothing — the money has to actually be out.
- **A queue, not a shared pool.** Ordered by `sortOrder` (ties broken by `createdAt` for stable ranks); the top item consumes its full quota before any profit flows down. Three items do *not* all unlock off one pot.
- **Marking an item bought consumes `price × multiplier` permanently**, not just the price — the quota is spent, so the rest of the queue drops back and rebuilds.
- Realized P/L can be negative → `availableTHB` clamps at 0; price and multiplier both clamp at 0 (a negative would *increase* headroom).
- Entry points: gift-icon in Portfolio's action row + a summary card in Portfolio's header grid (only when the queue is non-empty).

### 6.4 Net worth — `utils/netWorth.ts`
`netWorth = portfolioValue + cash − remainingDebt`. Almost the whole file is one guard: **reserve accounts double-count.** A `role: 'reserve'` account's `manualBalance` is *cumulative funded amount*, not a current balance, so money already spent on investments is still sitting in it.
- Worked example from the code: funded 80,000, bought 75,988, portfolio now 79,408 → naive 159,408; correct `(80,000−75,988)+79,408 = 83,420`.
- Reserve accounts are **grouped by `platform` before** subtracting invested cost, else two accounts on one platform each subtract the whole cost.
- `Math.max(0, funded − invested)` so a stale balance can't push cash negative.
- Reserve accounts with no `platform` link can't be reconciled and are used as-is.
- `hasUnfilledAccount` exists so the UI can say the cash figure is an under-estimate rather than presenting it as complete.

### 6.5 Everything else in `src/utils/`

| File | What it encodes | Sharp edges |
|---|---|---|
| `constants.ts` (160) | `COLORS`, `CHART`, `FONTS`, `TEXT` presets, `EXPENSE_CATEGORIES`, the FX cache (§5.2), `toChristianYear`, formatters | **Never use `COLORS.primary` as a chart color** and never pair green `#22A06B` with red `#D64545` in a chart — ΔE 5.4 under deuteranopia (needs ≥8); hence `CHART.expense = #3A6DB0` (ΔE 19.3). `formatCurrencyWithType` switches to 4 decimals below 1 so crypto doesn't render `฿0.00`. `toChristianYear` converts only when `year > 2400`. |
| `responsive.ts` (45) | Breakpoints **mobile 0 / tablet 768 / desktop 1024 / wide 1440**; returns `width,height,isDesktop,isTablet,isMobile,isWide,isWeb,sidebarWidth` (240 wide / 200 otherwise) | The removed max-widths (rule §1.3) are documented in its header; 16 screens carry echo comments. |
| `realizedAnalysis.ts` (119) | Per-trade P/L + portfolio-level realized CAGR, win rate, best/worst | CAGR uses a **cost-weighted average hold** (`Σcost·years / Σcost`), not a mean of per-trade percentages, which tiny/short trades would skew. `avgHoldYears < 0.25` → `annualReturnPercent: null` **plus `tooShort: true`** so the UI can say why. `isWin` is strictly `> 0`. |
| `holdingAnalysis.ts` (33) | Per-position CAGR + years-to-target | Holdings younger than **0.25y** return `tooNew` — annualizing a 2-week move gives thousands of %. Ratio math is done on native-currency prices (currency-invariant, no FX needed). `getYearsToTarget` is **currently unused**. |
| `investmentGoals.ts` (187) | Portfolio goal: progress, return required at 1/3/5/10y, projected arrival date | **Projection-rate precedence is deliberate: `realized` > `user` > `actual`.** A measured CAGR from real sales beats the user's optimistic input, which beats unrealized-portfolio CAGR. If none is `> 0`, every projection field is `null` rather than fabricated. Half this file (`yearsToReachGoal`, `requiredMonthlyContribution`, `monthsToReachGoal`, the step arrays) is **unused**. |
| `portfolioCoverage.ts` (67) | "พอร์ตเลี้ยงตัวเองได้แค่ไหน": `coverage = profitNow / expenseYTD`, and the return needed to cover expenses **plus `INFLATION_RATE` 2.5%** | Reads only real transactions, never user-typed monthly summaries. **Labelling invariant: `profitNow` is total unrealized profit to date, not this year's — the UI must not call it "กำไรปีนี้".** Both outputs are `null` (not 0/∞) when the denominator is ≤0. |
| `installments.ts` (50) | All `YYYY-MM` plan math | `getEndMonth = start + totalMonths − 1` — the off-by-one that makes the range inclusive. `getRemainingInstallments`/`getInstallmentNumber` return **`null`, not 0**, when the plan isn't active that month; `netWorth` depends on that distinction. Keys are zero-padded so string compare is chronological. |
| `activityLog.ts` (220) | The Overview feed + monthly in/out flow + category slices | Every date goes through `toChristianYear` before `new Date()` (mixed ISO / `YYYY-MM-DD` / BE sources) and `NaN` → sorted as 0, with an explicit `'ไม่ทราบวันที่'` bucket instead of dropping rows. Installment-plan-start events carry `amountTHB: null` — the principal is not cash out that day. `buildMonthlyFlow` **excludes investment buys/sells** ("คนละกระเป๋า") so investing doesn't read as spending. |
| `statementParser.ts` (154) | Bank-agnostic paste parser (KBank full / K PLUS quick / SAV passbook) | Core idea: every line carries a **running balance**, so amount *and* direction come from the delta — no bank vocabulary needed. **Amounts must have exactly 2 decimals** (the one guard stopping reference numbers being read as money). **`IN_KW` is checked before `OUT_KW`** because `'รับโอนเงิน'` contains `'โอน'`. Opening-balance lines are seeds, not transactions. Direction precedence: balance delta > `X1/X2` channel code > Thai keyword > default `out`. Sets `needsReview` instead of silently guessing. |
| `aiAnalysis.ts` (247) | The Statistics screen's insights | **Not LLM-backed** — pure local if/else heuristics over `getExpenses()` + `getPortfolioSummary()`, zero network. It is branded "AI วิเคราะห์" in the UI; it is a rule engine. Thresholds: top category >30% of month, MoM ±20%/−10%, run-rate >1.5×, stock share >70%, crypto >20%. Guards: month-over-month compares the **same 1..N day window** and requires `dayOfMonth >= 5` (the old code compared full-last-month vs month-to-date and printed "ลดลง 100%" every 2nd of the month); `stock_th` + `stock_foreign` collapse to one `stock` key before the diversification check. |
| `redAlert.ts` (40) | "ซื้อเพิ่มแล้วรอบนี้" — is a snoozed red-candle alert still in force? | Suppress needs **both** `count <= redAckCount` **and** the streak's first bar matching `redAckStreakAt`. Count alone is not enough: a broken-then-restarted streak of the same length (red 2 days again) has an identical count and would be swallowed. `getTwoRedDays` returns `streakStartAt` for exactly this. `streakStartAt == null` (API gave no bar times) → trust the count, since re-alerting on every screen open is worse. Changing an investment's red rule clears the ack (`AddInvestmentScreen`) — "2 bars" means a different thing per interval. |
| `dialog.ts` (48) | `notify` / `confirmAsk` | Native `Alert.alert` paths pass `onDismiss` → resolve; without it an Android back-press leaves the promise **pending forever**. `notify` returns a promise so you can await it before navigating over an open dialog. |
| `takeProfit.ts` (33) | Suggested take-profit % per asset class (crypto 40, stocks 20, fund 15, gold 12) | **Entirely unused.** Its natural pair `holdingAnalysis.getYearsToTarget` is also unused — the feature is unwired. |

---

## 7. UI layer

### 7.1 Navigation — `src/navigation/index.tsx` (401)

Boot order: `useAuth().loading` → spinner · `user && !currencyReady` → spinner · `!user` → `<LoginScreen />` (rendered **outside** any NavigationContainer, not a route) · else the navigator.

**One `Stack.Navigator` serves both layouts**; only the root screen and the chrome differ.
- **Desktop (≥1024px):** `DesktopSidebar` is a persistent shell rendered **outside `NavigationContainer`**, so pushing a sub-screen keeps the sidebar visible. The active tab is local state in `Navigation` — above the container — and reaches the root screen (`DesktopRootScreen`) through **`DesktopTabContext`**. Don't move that state back inside the navigator. A sidebar press also `navigationRef.navigate('Pakmut Wealth')`, otherwise the press looks dead while a pushed screen covers the pane. There is no tab navigator on desktop at all.
- **Mobile:** root screen is `MobileTabNavigator` (bottom tabs).

`TAB_ITEMS` is the single source for both: `HomeTab` (หน้าหลัก, custom inline SVG icon) · `PortfolioTab` (พอร์ต) · `ProfileTab` (โปรไฟล์). The root route is literally named **`'Pakmut Wealth'`** because child screens render the route name in their back button.

Stack routes: `AddExpense`, `AddInvestment`, `ManageByPlatform`, `AddIncome`, `IncomeScreen`, `Installments`, `AddInstallment`, `Accounts`, `ManageCatalog`, `ImportStatement`, `Overview`, `Statistics`, `Tax`, `SellReview`, `PurchaseGoals`.
Dead entries: **`IncomeScreen` is registered but nothing navigates to it**; `RootStackParamList` also declares `Home` and `Portfolio`, which have no `Stack.Screen`.

**`ProfileScreen` is the route hub.** `MENU_GROUPS` there consolidates what used to be scattered/unreachable: *สรุป & วิเคราะห์* → Overview / Statistics / Tax; *ข้อมูล* → Accounts / ManageCatalog / Installments / ImportStatement.

### 7.2 Screens

| Screen | Lines | Reached from | Notes |
|---|---|---|---|
| `PortfolioScreen` | **3005** | PortfolioTab | The heaviest file in the app and the hub for 7 routes. Holds: price refresh (`PRICE_REFRESH_MS` 5 min staleness), the responsive grid math (`GRID_COL_TARGET` 380, `GRID_MAX_COLS` 6, `CARD_GRID_BASIS` 520), the tax KPI card, purchase-goal + portfolio-goal cards, the realized-P/L card, "ถึงคิวลงไม้" red-candle alerts, the dry-powder/DCA card, and 3 modals (record sale, set goal, log dry powder). Mount deliberately skips `refreshIfStale` because `useFocusEffect` already ran `loadData()`. |
| `HomeScreen` | 1935 | HomeTab | Thai calendar (`react-native-calendars` + `LocaleConfig`), week/month toggle, day income/expense lists with multi-select delete, recurring-bills section. Reads + clears `pendingNavigation` on focus to re-select the day just edited. |
| `ManageByPlatformScreen` | 986 | Portfolio action row | Two modes: group-by-platform bulk edit (move / refresh prices / delete) and multi-row bulk add. `UNASSIGNED = 'ไม่ระบุแพลตฟอร์ม'`. |
| `TaxScreen` | 903 | Profile → สรุป & วิเคราะห์; Portfolio tax card | BE year picker, 4 accordion sections (one open at a time), the 12-month salary/withholding grid, per-asset gain rules. |
| `AddInvestmentScreen` | 901 | Portfolio (add + edit) | Three separate search backends by type (crypto / Thai stock / foreign stock / fund), live price on select, red-candle rule config. |
| `PurchaseGoalsScreen` | 792 | Portfolio (×2) | Queue cards with progress bars; funded by realized profit only. |
| `AddExpenseScreen` | 663 | Home (×3) | Dual mode — daily vs recurring (which writes the `monthlyAmounts` per-month grid). Receipt image picker → Supabase storage. |
| `ManageCatalogScreen` | 602 | Profile → ข้อมูล; Portfolio | Currencies + platforms with usage counts (blocks deleting in-use entries), live FX fetch, and the **cascading rename** via `catalogRename`. |
| `AccountsScreen` | 415 | Profile → ข้อมูล; Portfolio | Account CRUD; pushes `ImportStatement`. |
| `AddIncomeScreen` | 405 | Home | Own header (`headerShown:false`). Sets `pendingReturnDate`. |
| `StatisticsScreen` | 381 | Profile → สรุป & วิเคราะห์ | Thin view over `utils/aiAnalysis`; imports no storage service. |
| `ImportStatementScreen` | 357 | Profile → ข้อมูล; Accounts | Paste → `statementParser` → per-row classify → `importStorage.saveImportRows`. |
| `OverviewScreen` | 332 | Profile → สรุป & วิเคราะห์ | Widest data fan-in (6 storage services). Net worth + coverage + activity feed + the only two charts. |
| `IncomeScreen` | 318 | **unreachable** | Orphan route. |
| `SellReviewScreen` | 314 | Portfolio → "ทบทวนจังหวะขาย" | Refetches live prices for already-sold symbols. |
| `AddInstallmentScreen` | 265 | Installments | Monthly amount auto-derived from total/months, user-overridable. |
| `ProfileScreen` | 250 | ProfileTab | The route hub. **Reference implementation for `TEXT`/`FONTS` presets** — older screens still hardcode families and can be migrated opportunistically. |
| `LoginScreen` | 213 | rendered by `Navigation` when `!user` | Google OAuth only; not a Stack route. |
| `InstallmentsScreen` | 188 | Profile → ข้อมูล; Home | Splits active vs completed by computed remaining months. |

### 7.3 Charts — `src/components/charts/` (used only by Overview)
No chart library; hand-rolled on `react-native-svg`.
- `MonthlyFlowChart` (115): paired in/out bars drawn in **real measured pixels via `onLayout`** — never stretch the viewBox, `preserveAspectRatio="none"` distorts the rounded bar caps. Direct-labels only the worst overspend month.
- `CategoryBars` (81): horizontal because Thai category names are long; a single color because categories are unordered and a gradient would double-encode length and fail contrast at the light end; amounts sit outside the bar so short bars don't clip.

---

## 8. Data model

Tables, and which module owns each: `expenses` + `recurring_bills` (`storage`), `incomes` (`incomeStorage`), `investments` + `transactions` (`investmentStorage`), `realized_trades` (`realizedStorage`), `investment_plan` (singleton), `portfolio_goals` (singleton), `purchase_goals`, `installment_plans`, `accounts`, `account_transfers` (written only by `importStorage`), `user_currencies`, `user_platforms`, `tax_profiles`, `telegram_pending` (edge function only).

**jsonb columns — a schema change here needs no SQL, only a mapper change:**

| Column | TS type | Owner |
|---|---|---|
| `tax_profiles.months` | `TaxMonth[]` (always 12) | `taxStorage` |
| `tax_profiles.gain_rules` | `Partial<Record<InvestmentType, GainTaxRule>>` | `taxStorage` |
| `realized_trades.source_investment` | `Investment` (pre-sale snapshot, powers undo) | `realizedStorage` |
| `investment_plan.dry_powder_items` | `DryPowderItem[]` | `investmentPlanStorage` |
| `recurring_bills.monthly_amounts` | `{ 'YYYY-MM': number }` | `storage` |

`sql/` (all idempotent, all hand-run): `catalog_currencies_platforms` · `investment_plan_dry_powder` · `investments_red_rule` · `investments_red_ack` · `purchase_goals` · `realized_trades` + `realized_trades_undo` · `tax_profiles`. Each `create table` file also sets RLS + the four own-row policies — **copy that block when adding a table.** Note the base tables (`expenses`, `investments`, `investment_plan`, `telegram_pending`) have **no committed SQL** — they predate the convention.

Type notes: **`Currency = string`**, deliberately not a union, since users manage the catalog (`DEFAULT_CURRENCIES` is seed data only). `InvestmentType = stock_th | stock_foreign | fund | crypto | gold | other`. `RealizedTrade.fees` is THB while its `buyPrice`/`sellPrice` are in `currency` — an intentional asymmetry mirrored in `realizedAnalysis` and `taxCalc`.

---

## 9. Telegram bot — `supabase/functions/telegram-bot/`

A Deno edge function (its 8 TS errors under the app tsconfig are expected). Single-user receipt ingestion: a Telegram webhook POST → photo → download → **Gemini `gemini-2.5-flash`** OCR with a Thai prompt (`temperature: 0`, thinking disabled) → JSON `{amount,date,time,description,category}` → row in `telegram_pending` (`scanning` → `ready` / `need_category` / `failed`). `/done` shows a confirm keyboard; confirming inserts into `expenses` and clears the queue.

Uses the **service-role client, so it bypasses RLS** — `APP_USER_ID` is what scopes the rows. Secrets (all from `Deno.env`): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`, `APP_USER_ID`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Deploy is a manual `supabase functions deploy telegram-bot`; there is no config.toml, no CI, and the webhook registration isn't in the repo. It logs raw Telegram payloads to the function log.

**This is the only LLM call in the project** — there is no AI SDK in `package.json` and no model call in the app.

---

## 10. Known rough edges

Not bugs to fix on sight — context so you don't "discover" them twice.

- **Committed secret:** `api/twelve-data.js` `FALLBACK_KEY`. Rotate the Twelve Data key and delete the fallback once `TWELVE_DATA_API_KEY` is set in Vercel.
- **`renamePlatformEverywhere` misses `realized_trades.platform`** — a platform rename leaves realized history stale.
- **`importStorage` dedup truncates the description at 24 chars**, so legitimately distinct same-day/same-amount rows are silently skipped.
- **`getPortfolioSummary` returns zeros on any error** — an outage is indistinguishable from an empty portfolio.
- **`fundCatalog` never recovers from a failed `/funds.json` fetch** until page reload.
- **`taxStorage`'s legacy path fabricates per-month values** from old yearly scalars on every read, and the first save persists the fabrication.
- **Dead code:** all of `takeProfit.ts`; `holdingAnalysis.getYearsToTarget`; most of `investmentGoals`' annuity solvers; `constants.INVEST_EXPENSE_CATEGORY` (exported and documented, referenced nowhere — the "exclude investment transfers from the budget card" rule is currently unenforced); the `IncomeScreen` route.
- **Dead deps:** `react-native-paper`, `react-native-vector-icons`, `concurrently`. `babel-preset-expo` is declared **twice with conflicting majors** (`~54.0.10` in deps, `^55.0.18` in devDeps).
- **Empty `mt5_backend/` husk** on disk (gitignored, zero files) — a Windows file lock blocked its deletion. No MT5 code exists anywhere in `src/`.
- `public/favicon.svg` is **623 KB** — larger than every other asset, likely an unoptimized embedded raster.
- Four names in play for the same app: `narix` (Expo slug — **must stay**, the OAuth deep link depends on it), `wealth-lab` (Vercel project + repo dir), `Pakmut Wealth` (brand shown to users), and `tracking` (`package.json#name`, a leftover from the expense-tracker era — nothing reads it).
- `README.md` still advertises **`narix.vercel.app`**; the live origin is `wealth-lab-omega.vercel.app` (see `PROD_API_ORIGIN`, §2). Don't copy the URL out of the README.
