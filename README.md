# Prop Farm Navigator

## Hermes Trading Agent setup

Setting up the Hermes integration on a new VPS (or debugging why Hermes
can't see the knowledge base / strategy rules)? See
[`hermes-webui/hermes/SETUP.md`](hermes-webui/hermes/SETUP.md) — it covers
the full path from a bare VPS to a working Hermes agent, what's automatic
vs. a one-time manual step, and how to verify it's actually wired up.

---

This is the project and working on so I want everything to now be connected to meta API cloud so I want both the account stat and details shoe to be derived from meta API and let everything be functioning let the Lost size and everything be calculated accordingly and well calculated with no errors and mistake and if I want to execute the trade into execute the trade in the exness account using the exact blood size to be used and entry with stop loss with the exact risk to be taken I want you to improve this file and make it very professional and let all the calculation and everything be working accurately and also in the calculator I want to be able to select the exact prop account that I want to work with and if they calculation calculus it will calculate everything based on the prop account I selected and to be showing me the correct exact total capital needed for the strategy to work perfectly this is the calculation prompt of how the machine works Here is the ultimate, exhaustive prompt. This is written specifically to be fed into an advanced AI coding agent (like Cursor, Devin, or Claude 3.5). 



It leaves **zero room for hallucination**. It explicitly defines every variable, every formula, the exact MetaApi Cloud integration, and exactly how to carry over the numbers from Phase 1 to Phase 2 so the AI doesn't make the doubling errors, missing fee errors, or leftover balance errors we saw earlier.



***



**Copy everything below this line and paste it into the AI:**



***



**System Role:** You are an elite Quantitative Financial Engineer and Full-Stack Developer. 



**Objective:** Build the complete functional architecture and mathematical engine for a web-based "Prop Farming Terminal" (named GizzyFx). This application is a dual-account arbitrage calculator, a universal prop firm validator, an automated trading journal, and an automated trade execution terminal using MetaApi Cloud. 



Please write the complete HTML structure, JavaScript logic, and MetaApi Cloud SDK implementation required to execute the exact functionality below. Do not focus on CSS/UI styling; prioritize mathematical accuracy, real-time state updates, and secure API connections.



### PART 1: THE CORE MATHEMATICAL ENGINE (Real-Time Logic)

The calculator relies on an "Inverted Mirror" hedge between a Prop Firm account and an Exness Standard Cent account. To avoid detection, the user will dynamically rotate between 1:1.5 R:R and 1:2 R:R (NEVER 1:1).



**Real-Time Execution Requirement:**

EVERY input field in the Engine must have an `oninput` event listener that triggers the `autoCalc()` function instantly. No "calculate" button should be required.



**Dynamic Formulas:**

*   **Pip Values:** $10 for EURUSD/GBPUSD, $9 for USDJPY. Pip Size is 0.0001 (0.01 for JPY).

*   **Prop SL (pips):** User input (e.g., 30).

*   **Prop TP (pips):** `Prop SL * rrMultiplier`.

*   **Exness SL (pips):** `Prop TP` (Inverted).

*   **Exness TP (pips):** `Prop SL` (Inverted).

*   **Prop Lots:** `Prop Risk ($) / (Prop SL pips * Pip Value)`.

*   **Exness Lots:** `Exness Win Target ($) / (Exness TP pips * Pip Value)`.

*   **MT5 Price Calculation:** Calculate exact SL/TP prices down to 5 decimal places (3 for JPY) based on the Entry Price +/- (Pip Distance * Pip Size).



### PART 2: ESCALATING SHIELD & WORST-CASE MATH (CRITICAL)

Because the user rotates R:R ratios (1:1.5 and 1:2), the Exness fuel burn changes per trade. To guarantee the Exness account NEVER blows, all "Capital Required" calculations MUST use the **Worst-Case R:R Multiplier of 2** (1:2 R:R).



The app has a toggle for `currentPhase` (1 or 2). It takes a variable number of losses to blow an account (calculated as `Max DD USD / Prop Risk USD`).



**If currentPhase === 1:**

1. `totalRecovery` = `Prop Fee + Desired Profit on Blow`

2. `exnessWinTarget` = `totalRecovery / lossesToBlow`

3. `exnessLossTarget` = `exnessWinTarget * 2` (Using worst-case 1:2 R:R)

4. `pureExnessCapital` = `exnessLossTarget * winsToPass`

5. `bufferedExnessCapital` = `pureExnessCapital * 1.20` (20% Safety Buffer for spread/slippage)

6. `phase1TotalSpent` = `Prop Fee + bufferedExnessCapital`

7. *Calculate Leftover if Passed:* `phase1ExnessBurn` = `exnessLossTarget * winsToPass`

8. `phase1Leftover` = `bufferedExnessCapital - phase1ExnessBurn`



**If currentPhase === 2:**

(User inputs `phase1TotalSpent` and `phase1Leftover` from the previous calculation. Note: Prop firms do NOT charge a fee again for the Funded Stage, so `phase1TotalSpent` already includes the fee. If Phase 2 is blown, we must recover the original fee AND the Phase 1 burn AND the profit.)

1. `totalRecovery` = `phase1TotalSpent + Desired Profit on Blow`

2. `exnessWinTarget` = `totalRecovery / lossesToBlow`

3. `exnessLossTarget` = `exnessWinTarget * 2`

4. `pureExnessCapital` = `exnessLossTarget * winsToPass`

5. `bufferedExnessCapital` = `pureExnessCapital * 1.20`

6. `phase2RefillRequired` = `bufferedExnessCapital - phase1Leftover` (CRITICAL: Subtract the leftover buffer from Phase 1!)

7. `totalRequiredCapital` = `phase1TotalSpent + phase2RefillRequired`



### PART 3: FINAL P&L & VALIDATOR VERDICT

The previous version of this machine had a bug where it forgot to subtract the Prop Fee and the Phase 1 burn when calculating Final Net Profit. You MUST use these exact formulas:



1. `propPayout` = `propTargetUSD * profitSplit`

2. `phase2ExnessBurn` = `exnessLossTarget * winsToPass` (Using Phase 2 worst-case variables)

3. `leftoverExnessBalance` = `bufferedExnessCapital - phase2ExnessBurn`

4. `netProfitIfPassed` = `propPayout + leftoverExnessBalance - totalRequiredCapital`



**Validator Verdict Logic:**

*   If Drawdown Type is "Trailing", output RED ALERT: "Strategy Broken: Trailing Drawdown."

*   If `netProfitIfPassed < $20`, output RED ALERT: "Not Profitable: Payout too small for Exness fuel."

*   If `netProfitIfPassed >= $20`, output GREEN ALERT: "Highly Profitable: Safe to trade. Est. Net Profit: $" + `netProfitIfPassed`.



### PART 4: METAAPI CLOUD INTEGRATION (LIVE PRICES & AUTO-EXECUTION)

The frontend will connect directly to MetaApi Cloud using the official `metaapi-cloud-sdk` loaded via CDN. The user will input their MetaApi Token and Account ID into the frontend.



**1. Live Price Fetching:**

*   Provide a dropdown for EUR/USD, GBP/USD, USD/JPY.

*   A "Fetch Live Price" button that connects to MetaApi, retrieves the current live price, auto-fills the "Entry Price" field, and triggers `autoCalc()`.



**2. Pending Order Execution Logic (`executeExnessTrade()`):**

When the user clicks "Execute Exness Trade Automatically", the app must place a Pending Order on the Exness MT5 account via MetaApi. It must calculate the correct MT5 Pending Order type based on the Exness direction and the Entry Price relative to the current live market price.



*   **If Exness Direction is LONG:**

    *   If `entryPrice` < Current Live Price -> `order_type = "BUY_LIMIT"`

    *   If `entryPrice` > Current Live Price -> `order_type = "BUY_STOP"`

*   **If Exness Direction is SHORT:**

    *   If `entryPrice` > Current Live Price -> `order_type = "SELL_LIMIT"`

    *   If `entryPrice` < Current Live Price -> `order_type = "SELL_STOP"`



**MetaApi SDK Implementation:**

Use the SDK to create the pending order. The payload must include the symbol, volume (lots), price, stop_loss, and take_profit. Handle the async response and display the MT5 ticket number or error message in the UI status box.



### PART 5: AUTOMATED TRADING JOURNAL & ANALYTICS

The journal automatically calculates P&L based on the live values currently in the Engine tab.

*   **Trade Logging Inputs:** Date, Pair, Direction, Result (Win/Loss).

*   **Automatic P&L Math:**

    *   If WIN: Prop P&L = `Prop Target per trade ($)`. Exness P&L = `-(Exness Win Target * rrMultiplier)`.

    *   If LOSS: Prop P&L = `-(Prop Risk ($))`. Exness P&L = `Exness Win Target`.

    *   Net P&L = `Prop P&L + Exness P&L`.

*   **Instant Rendering:** The moment a trade is logged, append it to the HTML table and update Stats Cards (Total Trades, Win Rate, Net P&L, Profit Factor). Do not wait for a page reload.

*   **Chart.js Integration:** Include an Equity Curve (Line chart) and Win/Loss Distribution (Doughnut chart) that update dynamically when a trade is logged.

*   **Local Storage:** Save the journal array to `localStorage` so data persists.



**Deliverables:**

Please output the complete, fully functioning HTML structure, JavaScript logic, Chart.js implementation, and MetaApi Cloud SDK integration. Ensure all math formulas are perfectly translated into JavaScript and the state variables are correctly scoped and updated in real-time.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9fca6da0-2234-4739-bf80-f2349d4b94a3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
