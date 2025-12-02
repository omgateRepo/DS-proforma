# Real Estate Project Manager
status: Draft  
owner: Product  
last_updated: 2025-11-26

## 1. Overview
Operate a single web application that tracks multifamily real-estate deals from sourcing through stabilization. Users can add/delete projects, manage their position on a Kanban board, and capture detailed revenue/cost data for each project.

## 2. Objectives
- Centralize every deal with an auditable lifecycle (New → Offer Submitted → Under Contract → In Development → Stabilized).
- Provide a canonical place to model rent roll assumptions, construction budgets, and carrying costs for each project.
- Produce a cashflow rollup (budget vs actual) without exporting to spreadsheets.

## 3. Non-Goals
- Debt/equity capital stack modeling (future enhancement).
- Investor portal, document storage, or e-signatures.
- Automated market comps or rent forecasting.

## 4. Users
Two co-founders (you and your partner) share the same workspace. No role-based access or permissions are required at this stage; everyone can perform every action (create/delete projects, edit data, move cards).

## 5. Core Flows
1. **Create project**  
   - Required field: `name` (unique per active project).  
   - Default stage: `New`.  
   - Triggered from a global “Add Project” button that opens a modal asking only for the name (keeps the Kanban board uncluttered).  
   - Optional metadata (future): address, target units, notes.
2. **Kanban board**  
   - Columns: New, Offer Submitted, Under Contract, In Development, Stabilized.  
   - Cards show name + key stats (units, current rent, total cost).  
   - Drag-and-drop (or dropdown) to change stage; record timestamp in history table.  
   - The Kanban view is dedicated: it shows only the board plus the global “Add Project” button (full-width layout with generous spacing). Selecting a card navigates to the project detail view (no split-pane).
   - Stage transitions enforce data-completeness gates (documented in §6.1.1) so deals cannot advance without the required General tab information.
3. **Delete project**  
   - Allowed from any stage; must cascade delete all child records (apartments, costs, cashflow lines).  
   - Soft delete for compliance (mark `deleted_at`) is acceptable if we keep data for reporting.  
   - Every destructive action (delete project, delete revenue line, etc.) must prompt a confirmation modal: “Are you sure?” with explicit “Cancel” / “Delete” buttons.
4. **Project Detail View / Edit**  
   - Separate route that takes the full page for the selected project (no Kanban visible simultaneously).  
   - Tabs:
   - **General** – address, acquisition details, target metrics.  
   - **Revenue** – manage rent roll assumptions by apartment type.  
   - **Hard Costs** – construction/renovation capital expenditures with payment schedule.  
   - **Soft Costs** – professional services, permits, etc.  
   - **Carrying Costs** – debt service, insurance, taxes while project is underway.  
   - **Cashflow** – aggregates all inflows/outflows, supports budget vs actual tracking.

## 6. Tab-Level Requirements & Multi-User Model

### 6.0 Accounts, Roles, and Sharing
- **Authentication** now uses real user records instead of the single hard-coded Basic Auth pair.
  - `users` table tracks `id`, `email`, `display_name`, `password_hash`, `is_super_admin`.
  - Login flow is unchanged in the UI (Basic Auth overlay) but credentials are validated against the database (`bcrypt`).
- **Roles**
  - `is_super_admin` users (founders) can create/reset other accounts and can see every project.
  - Standard users only see projects they own or that a collaborator shared with them.
- **Project Ownership & Collaboration**
  - `projects.owner_id` references the user who created/owns the deal.
  - `project_collaborators` (`project_id`, `user_id`, optional `role`) grants read/write access to additional users.
  - Every API call asserts the current user either owns the project, is listed as collaborator, or is super admin before returning/ mutating data.
- **Admin screens**
  - A small “Users” admin view (super admin only) lists accounts with actions to add/reset users.
  - Each project detail card includes a “Collaborators” panel for owners/admins to add/remove users by email.
- **Persistence**
  - Basic Auth credentials are still stored client-side, but now they map to users in the new table, so future enhancements (password resets, SSO) can plug into the same model.

### 6.1 General Tab
- Fields:
  - `address_line1`, `address_line2`, `city`, `state`, `zip`.
  - `property_type` (land, existing building).
  - `description` / notes.
  - `purchase_price_usd`, `closing_date`.
    - Closing date uses a date picker (month/day/year) so timelines align with cashflow modeling.
  - `start_leasing_date`, `stabilized_date` – optional project-level milestones (both post-closing) that drive revenue ramping and default management scheduling.
    - Management fees (including the auto-generated turnover line) default their start month to the Start Leasing Date.
    - All revenue rows ramp linearly from 0 at the Start Leasing Date to full run-rate at the Stabilized Date; before leasing begins they contribute 0 to cashflow.
  - `latitude`, `longitude` – captured from the address autocomplete (editable if adjustments needed). Used for satellite preview and mapping context.
  - `target_units`, `target_sqft`.
  - `sponsor` (future, for LP/GP tracking).
- Actions: edit inline, save/cancel, upload hero photo (future).

#### 6.1.1 Stage-based validation

- **Project creation (stage = New)**  
  - Only the `name` is required in the “Add Project” modal.  
  - All General tab fields remain optional while the project stays in the `New` column.
- **Moving to Offer Submitted**  
  - Block the transition unless the following General fields are populated: `address_line1`, `city`, `state`, `zip`, `purchase_price_usd`.
- **Moving to Under Contract (new third stage)**  
  - Requires everything from Offer Submitted **plus** `target_units`, `target_sqft`, and `closing_date`.
- **Moving to In Development or Stabilized**  
  - No additional fields beyond the Under Contract requirements, but the gate remains enforced (i.e., a project cannot jump ahead unless all fields listed above are filled in).
- These validations fire both when dragging cards across the Kanban board and when selecting a stage from the detail view dropdown. The UI should surface a clear error message listing the missing fields.

### 6.2 Revenue Tab
- Clicking the **Add** button now presents three options:
  1. **Apartment Type** (formerly “unit type”) – multi-unit rents (e.g., 1bd/1bth).
  2. **Retail Type** – storefront or podium space assumptions, mirrors Apartment fields but typically one unit per bay.
  3. **Parking Type** – structured like apartment types but for parking variations (garage, uncovered, etc.).
- Above the listings, a dedicated **Apartment Turnover** card captures building-wide assumptions:
  - **Annual Turnover %** – percent of apartments expected to change tenants each year.
  - **Turnover Cost / Unit** – one-time refresh cost incurred for each turnover.
  - Saving writes the values at the project level so Metrics and future reports can reference them without editing each apartment type.
- Apartment/Parking forms capture:
  - `type_label` (e.g., "1bd/1bth" or "Garage Parking").
  - `unit_sqft` (optional for apartments, still tracked for reference).
  - `unit_count`.
  - `monthly_rent_usd` (budget).
  - `vacancy_pct` (default 5%).
  - `start_month` (integer month offset; revenue hits cashflow starting that month). As the user types/selects a month number, the UI shows `Month N • Month/Year` so you always know which calendar month you’re targeting (closing month is Month 1).
- Start month selection now defaults to **At leasing start**, which locks the item to the project’s Start Leasing Date. Switching the radio button to **Custom** reveals the manual month input for cases where a specific type begins earlier/later than the global leasing kickoff.
- Parking omits square footage by default but keeps the same scheduling semantics (start month + vacancy). Revenue is calculated the same way (`rent * count * (1 - vacancy)`).
- Listing UI is grouped by category (Apartments, Retail, Parking) with per-section monthly + annual summaries plus the overall totals. All revenue modal fields are required before save so cashflow projections are always based on complete input.
- Cashflow ramps every revenue line item from 0 at the Start Leasing Date to full net rent at the Stabilized Date (both configured on the General tab). Before leasing begins the line contributes 0; after stabilization it remains flat at the steady-state value.
- Turnover assumptions:
  - The **Turnover** card at the top of the tab now captures separate % and per-unit costs for Apartments and Retail.
  - Saving updates both the Metrics tab and the Management auto rows so churn for either asset class is budgeted in carrying costs automatically.
- Cashflow integration:
  - Apartment/Parking lines start at their configured month; before that they contribute zero.
- GP contributions and loan assumptions now live under the dedicated **Funding** tab (§6.5) so revenue stays focused on operating income.
- Bulk actions: duplicate/delete still apply per category. Future enhancements (e.g., % increase) can respect the new structure.

### 6.3 Hard Costs Tab
- Same modal workflow as Soft Costs (popup, form fields, scheduling selector).  
- Required fields:
  - `cost_name`
  - `amount_usd`
  - `hardCategory` (choose from the predefined list below)
  - Scheduling inputs: `payment_mode` + either `payment_month`, `range_start/end`, or `month_list` (with optional percentages).  
- Predefined starting list (can be tweaked later, but ship with these):
  - Structure — Per Square Feet
  - Framing — Per Square Feet
  - Roof — Per Square Feet
  - Windows — Per Square Feet
  - Fasade — Per Square Feet
  - Rough Plumbing — Per Apartment
  - Rough Electric — Per Apartment
  - Rough HAVAC — Per Apartment
  - Fire Supresion — Per Square Feet
  - Insulation — Per Square Feet
  - Drywall — Per Linear Feet
  - Tiles — Per Linear Feet
  - Paint — Per Linear Feet
  - Flooring — Per Apartment
  - Molding (+ doors) — Per Square Feet
  - Kitchen — Per Apartment
  - Finished Plumbing — Per Apartment
  - Finished Electric — Per Apartment
  - Appliances — Per Apartment
  - Gym — Per Building
  - Study Lounge — Per Building
  - Roof Top — Per Building
- Measurement unit options: Per Square Feet, Per Linear Feet, Per Apartment, Per Building, or `None`. When the measurement unit is not `None`, the modal requires `price_per_unit` and `units_count` and automatically calculates the total amount. When `None` is selected, the user can enter a lump-sum `amount_usd`.
- Each entry can schedule money exactly like soft costs (single month, range, multi-month with optional % allocation). Every hard-cost modal field (name, category, measurement fields when applicable, schedule) is required so downstream reports never contain partial data. Totals roll into the cashflow grid immediately.
- Every month input (single start month, range boundaries, multi-month lists) displays the Month N + calendar month hint in real time, so users don’t have to mentally translate offsets back to the calendar.

### 6.4 Soft Costs Tab
- Same structure as Hard Costs but flagged with category (Architect, Legal, Permits).  
- Payment scheduling options (modal-driven):
  - **Single month:** enter one integer offset (month index).
  - **Range:** specify start and end month (inclusive). The amount is spread evenly unless custom percentages are provided.
  - **Multiple months:** comma-separated month indexes (e.g., `0,1,2`). When multiple months are chosen, optionally specify the percentage of the total allocated per month (must add up to 100%).
- These options let finance teams stage retainers, progress draws, or recurring soft costs without juggling separate entries, and all inputs in the modal are required to keep the cashflow in sync.

### 6.5 Funding Tab
- Centralizes sponsor equity (GP contributions) and construction/bridge loans while referencing other tabs for read-only context. Nothing here mutates Hard/Soft/Revenue data—it simply layers financing controls on top for modeling and Metrics.
- Layout mirrors other tabs: each section gets a dedicated card, table, and scoped Add button.

#### 6.5.1 GP Contributions
- **Purpose** – capture one-time capital infusions from GP partners. Values roll into the cashflow (single-month inflow) and power the Metrics tab’s Founders Equity calculation.
- **Modal fields**
  - `partner` dropdown (Darmon, Sherman; future list-driven).
  - `amount_usd`.
  - `contribution_month` (month index; renders Month N + calendar hint on input).
- **Listing UI**
  - Columns: Partner, Amount, Month (with helper), Actions.
  - Empty-state messaging nudges users to add contributions.
- **Behavior** – Save injects the inflow into cashflow, updates Metrics, and persists in the shared API payloads just like revenue/expense rows.

#### 6.5.2 Loans
- **Item Structure**
  - `title` (freeform, e.g., “Bridge Loan A”).
  - `loan_mode`: `interest_only` or `amortizing`.
  - `loan_amount_usd`.
  - `loan_term_months` (integer).
  - `interest_rate_pct` (APR).
  - `funding_month` (month offset when proceeds hit cashflow; Month N helper included).
  - `repayment_start_month` (first month debt service leaves the account).
- **Cashflow Behavior**
  - Funding month injects a positive inflow equal to `loan_amount_usd` (still grouped under Carrying Costs → Loans in the grid).
  - For **amortizing loans**:
    - Compute a level monthly payment via the amortization formula.
    - Split each payment into `Loan – Interest` and `Loan – Principal` sub-lines in Carrying Costs.
    - Continue until the term ends or the balance is zero.
  - For **interest-only loans**:
    - Monthly outflow = `loan_amount_usd * rate / 12` (rendered as `Loan – Interest`).
    - The month immediately **before** the term ends posts a lump-sum outflow equal to the original principal labeled `Loan – Principal Payoff`.

### 6.6 Carrying Costs Tab
The Carrying tab now mirrors the Revenue tab’s pattern: a single **Add** menu that lets users pick which cost bucket to add rows under. Supported buckets (MVP):

1. **Property Tax**
2. **Management Fees**

Each bucket renders its own table with per-line totals plus a modal for add/edit (consistent UI with other tabs). Delete controls remain hidden (global rule) except within the modal confirmation step. Every carrying-cost modal field is required before save to avoid ambiguous cashflow rows.

#### 6.6.1 Property Tax (Construction vs Stabilized)
- **Dual-line model**
  - The Add → Property Tax modal now includes a required `tax_phase` selector with two options: **Construction RE Tax** and **Stabilized RE Tax**.
  - Each project should capture **exactly two** property-tax rows (one per phase). The UI pre-labels the row title accordingly (`Construction RE Tax` / `Stabilized RE Tax`), though users can append context in parentheses if needed.
  - Both rows behave like normal carrying items in the cashflow grid; the distinction only drives how downstream metrics treat the values.
- **Fields (shared by both phases)**
  - `amount_usd` (per interval).
  - `start_month`.
  - `end_month` (optional; if omitted the item continues through the 60-month grid).
  - `interval_unit`: `monthly`, `quarterly`, or `yearly`.
  - Optional helper `title` for extra labeling (defaults to the selected phase label).
- **Cashflow Behavior**
  - Normalize the amount to a monthly series based on the interval.
    - Monthly = amount every month.
    - Quarterly = amount every 3 months.
    - Yearly = amount every 12 months.
  - Respect start/end months when plotting to the grid.
  - Construction RE Tax typically stops once stabilization is achieved; Stabilized RE Tax often continues indefinitely. Both still surface under the Carrying Costs → Property Tax grouping.
- **Metrics tie-in**
  - Construction RE Tax is consumed by the Metrics tab’s loan-sizing calculation (§11.4) so the debt budget accounts for taxes during the build.
  - Stabilized RE Tax flows into the NOI calculation (§11.5) alongside Building Management, mirroring the steady-state view of operations.

#### 6.6.2 Management Fees
- **Fields**
  - `title` (required; e.g., “Leasing Management”).
  - `amount_usd` (per interval).
  - `start_month`.
  - `end_month` (optional).
  - `interval_unit`: `monthly`, `quarterly`, `yearly`.
- **Cashflow Behavior**
  - Same interval logic as Property Tax.
  - These rows appear under Carrying Costs → Management with per-line totals and flow into the aggregated Carrying Costs row.
- **Automatic Turnover Lines**
  - Apartment + Retail turnover settings (Revenue tab) each contribute a read-only monthly line item under Management so costs stay synced with the leasing assumptions.
- **Automatic Turnover Line**
  - The global Apartment Turnover settings (Revenue tab) automatically inject a read-only row under Management showing the annual refresh cost = `turnover_pct × apartment_units × turnover_cost`.
  - The line is informational only (no edit/delete icons) but its monthly equivalent is added to the Management summary totals so NOI/CAP Rate reflect tenant churn assumptions.

#### 6.6.3 UI & Validation Notes
- All month-entry controls reuse the shared helpers so they show `Month N • Calendar Month`.
- Property Tax + Management modals ensure `start_month <= end_month` when an end month is provided.
- Modals disclose how amounts map to the cashflow (e.g., “Quarterly • $45,000 posts every Month 3 starting Month 4”).
- Carrying Costs table shows grouped totals per bucket plus the combined monthly impact.

### 6.7 Cashflow Tab
- 60-month horizontal grid starting at month 0 (closing month). Months run left-to-right as column headers (M0…M59) with friendly month/year labels in tooltips.  
- Rows are grouped (and color-coded) by category: Revenues, Soft Costs, Hard Costs, Carrying Costs, and Total. Each header can expand to reveal the underlying line items.  
- Soft & Hard cost modals feed their rows:
  - **Single** month → entire amount sits in that month.
  - **Range** → amount spread evenly across the inclusive window.
  - **Multiple months** → split evenly or by user-defined percentages that must add up to 100%.
- All month selectors show the Month # + calendar month helper text (Month 5 • Jun 2026) to keep offsets intuitive.
- Revenue row currently uses the net monthly rent (from Revenue tab) applied to each month; later we can layer in lease-up ramps or vacancy shocks.
- Carrying cost row is still a placeholder until that tab ships; once built, those entries will feed the grid the same way.
- Totals row = Revenues + all expenses for each month, letting the user see net cashflow instantly.
- Data refresh is immediate—updating a revenue, hard cost, or soft cost re-renders the 60-month sheet.
- Allow manual adjustments (e.g., equity injection).  
- Export to CSV later.

### 6.8 Shared API Types (`@ds-proforma/types`)
- The repo now ships a dedicated workspace that exports Zod schemas for every major payload (project create/update, apartment/parking revenue, GP contributions, etc.).
- The backend uses those schemas to validate incoming JSON before touching Prisma, while the frontend can import the same definitions (or their inferred TypeScript types) to keep forms and API clients aligned.
- Whenever you introduce a new field or endpoint, update the shared schema first; both client and server should rely on it instead of duplicating validation logic.

## 7. Data Model

### 7.1 Entities

| Table | Key Fields | Notes |
| --- | --- | --- |
| `projects` | `id (uuid)`, `name`, `stage`, `address_line1`, `city`, `state`, `zip`, `property_type`, `purchase_price_usd`, `target_units`, `target_sqft`, `created_at`, `updated_at`, `deleted_at` | Stage enum: `new`, `offer_submitted`, `under_contract`, `in_development`, `stabilized`. |
| `project_stage_history` | `id`, `project_id`, `from_stage`, `to_stage`, `changed_by`, `changed_at` | Append-only log for analytics. |
| `apartment_types` | `id`, `project_id`, `type_label`, `unit_sqft`, `unit_count`, `rent_budget`, `rent_actual` | Revenue tab rows. |
| `cost_items` | `id`, `project_id`, `category` (`hard`, `soft`, `carrying`), `cost_name`, `amount_usd`, `payment_month`, `start_month`, `end_month`, `carrying_type`, `loan_mode`, `loan_amount_usd`, `loan_term_months`, `interest_rate_pct`, `funding_month`, `repayment_start_month`, `interval_unit` | Carrying rows now track richer attributes per type; hard/soft rows continue to use scheduling + measurement columns documented above. |
| `cashflow_entries` | `id`, `project_id`, `month_index`, `budget_inflows`, `budget_outflows`, `actual_inflows`, `actual_outflows`, `notes` | Derived but persisted for overrides. |

### 7.2 Relationships
- `projects 1..n apartment_types`.
- `projects 1..n cost_items`.
- `projects 1..n cashflow_entries`.
- `projects 1..n stage_history`.

### 7.3 Example JSON (Project Detail)
```json
{
  "id": "proj_123",
  "name": "Maple Apartments",
  "stage": "in_development",
  "revenue": [
    {
      "type_label": "1bd/1bth",
      "unit_sqft": 650,
      "unit_count": 40,
      "monthly_rent_usd": 2150,
      "monthly_rent_actual_usd": 2050
    }
  ],
  "hard_costs": [
    { "cost_name": "Foundation", "amount_usd": 250000, "payment_month": 1 }
  ],
  "soft_costs": [
    { "cost_name": "Architect", "amount_usd": 45000, "payment_month": 0 }
  ],
  "carrying_costs": [
    { "cost_name": "Loan Interest", "monthly_amount_usd": 30000, "start_month": 2, "end_month": 18 }
  ],
  "cashflow": [
    { "month_index": 0, "budget_inflows": 0, "budget_outflows": 100000, "actual_outflows": 95000 }
  ]
}
```

## 8. Open Questions
1. Do we need multi-tenant support (per investor group)?  
2. Should stage transitions enforce required data (e.g., must have rent roll before entering In Development)?  
3. Cashflow time horizon defaults (36 vs 60 months)?

## 9. Changelog
- `2025-11-26` – Drafted initial specification covering Kanban workflow, detailed tabs, and schema outline.

## 10. Engineering Guidelines & Refactor Plan
To keep delivery predictable as the app grows, follow these coding practices before adding new features:

1. **Feature Modularization**  
   - Split the monolithic `frontend/src/App.jsx` into feature folders (`features/kanban`, `features/revenue`, `features/costs`, `features/cashflow`, `features/map`).  
   - Each feature owns its components, hooks, and styles so changes stay localized.

2. **Shared Components & Utilities**  
   - Promote reusable UI (modals, dropdowns, inputs) to `frontend/src/components`.  
   - Centralize cross-cutting helpers (month-offset math, currency formatting) inside `frontend/src/utils`.

3. **State Management**  
   - Introduce a lightweight store (React Context or Zustand) in `frontend/src/state/projectsStore.js` to hold selected project, Kanban data, and mutations.  
   - Keep API side effects out of presentational components by moving fetch/update logic into dedicated hooks.

4. **Typing & Validation**  
   - Gradually migrate new/updated modules to TypeScript, defining shared interfaces in `frontend/src/types`.  
   - Use runtime validation (zod/yup) inside modal submit handlers so malformed payloads never hit the API.

5. **Database Migrations**  
   - Replace ad-hoc `ALTER TABLE` calls with a numbered migration system (e.g., Prisma, node-pg-migrate).  
   - Add `npm run migrate` scripts for both local and Render environments to keep schemas in sync.

6. **Testing & Storybook**  
   - Add unit tests (Vitest + RTL) for revenue/cost modals and cashflow calculators.  
   - Document complex UI states in Storybook to speed up QA of incremental styling/behavior tweaks.

7. **Incremental Delivery**  
   - Implement these guidelines in phases (e.g., modularize revenue/costs first, then cashflow, then shared store).  
   - Each phase ships independently, preventing refactors from blocking feature work.

All new work should reference this plan so the codebase trends toward smaller components, consistent data handling, and easier maintenance.

### 10.1 Runtime Security & Access Control (Stage 4)
- **API Protection**  
  - Every `/api/*` request is authenticated with HTTP Basic Auth. Credentials come from `RENDER_AUTH_USER` / `RENDER_AUTH_PASSWORD` (Render) or `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` for local dev.  
  - Opt-out flags: `SKIP_AUTH=true` (local only) disables the guard; `SKIP_RATE_LIMIT=true` bypasses throttling.
  - Rate limiting defaults: `RATE_LIMIT_WINDOW_MS=60000` and `RATE_LIMIT_MAX=300`. Both can be tuned per environment.
  - Helmet is enabled with relaxed CORP (`cross-origin`) so the satellite preview continues to embed images fetched from `/api/geocode/satellite`.
- **Frontend Session Flow**  
  - A blocking “Sign in” overlay appears until credentials are supplied. The UI stores the Basic Auth pair in `localStorage` so page refreshes keep the session alive.  
  - All API helpers automatically inject the `Authorization` header and listen for `401` responses; when the backend rejects a request, the store is cleared and the login modal reopens.
  - Users can click “Sign out” (top-right) to wipe stored credentials and return to the login screen.
- **Environment Checklist**  
  - Backend: set `RENDER_AUTH_USER`, `RENDER_AUTH_PASSWORD`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, and `FRONTEND_ORIGIN`.  
  - Frontend: ensure `VITE_API_BASE_URL` points at the authenticated backend. No additional env vars are needed—the login overlay captures ds/ds1 at runtime.  
  - Deployment order: ship the backend first (so auth middleware is live), then ship the frontend (so the login modal can collect credentials instead of failing silently).

These measures make sure only the two intended users can access the environment while keeping the entry point lightweight (no database-backed accounts yet). Future stages can replace the Basic Auth credentials with a richer auth system without touching the tab flows described above.

### 10.2 Testing & Continuous Integration Refinement (Stage 5)
- **Frontend Suite (Vitest + React Testing Library)**  
  - `GeneralTab` spec covers form submissions and satellite preview rendering.  
  - `RevenueSection` exercises the apartment modal validations and error paths.  
  - `costHelpers` lock down single/range/multi-month scheduling and measurement math.  
  - `App` auth overlay tests verify the Basic Auth flow (login persistence, 401 handling, and sign-out).  
  - `npm run test` executes all Vitest files; `npm run lint`/`npm run typecheck` ensure JSX/TS stay clean.
- **Backend Suite (Vitest)**  
  - `tests/carryingPayload.test` validates `normalizeCarryingPayload` across loan/property-tax/management scenarios.
- **Shared Tooling & CI**  
  - New flat ESLint configs for both workspaces plus root scripts (`npm run lint`, `npm run typecheck`, `npm run test`) orchestrate frontend + backend.  
  - `.github/workflows/ci.yml` runs install → lint → typecheck → test on every push/PR to keep the Render deploys green.

### 10.3 Deployment Polish & Future Hardening (Stage 6 Agenda)
- **Wrap the SPA behind Express (security + parity)**  
  - Implement a small Express server in `frontend/` that serves the built assets and proxies `/api` so the existing Basic Auth + rate limiting protect both frontend and backend.  
  - Update the current Render “frontend” service to run as a web service (e.g., `npm run build && node dist/server.js`) and provide the same `RENDER_AUTH_*` env vars used on the backend.  
  - Flip the Render service from static site to web service only after validating the wrapper locally and in staging, so the transition doesn’t break access.
- **CI as a deploy gate (future enhancement)**  
  - Today CI runs but does not block auto-deploys; once the pipeline has a clean track record we can enable GitHub required checks or switch the Render services to “manual deploy” so failed builds never ship.
- **Ongoing lint/test debt**  
  - As future tickets touch existing files, spend a few minutes clearing the lingering warnings (unused vars, hook deps, `any` escapes) so we can ratchet ESLint back to stricter settings without a massive cleanup effort.

## 11. Metrics & Sensitivities Tab (Stabilized CAP Rate Dashboard)
A new tab translates the entire proforma into a single reproducible CAP Rate while letting the user stress different assumptions (Best Case / Worst Case). All values are read-only snapshots from other tabs unless explicitly marked editable; edits in this tab do **not** write back to the source data and have **zero impact on the Cashflow tab**. Every derived figure shows a tooltip (hover on a `?` icon) that explains the calculation.

### 11.1 Revenues (Stabilized View)
- Table lists **every apartment type** pulled from the Revenue tab: Type Label, # Units, SqFt, Base Monthly Rent (read-only).  
- Inline inputs allow overriding **Monthly Rent – BC** and **Monthly Rent – WC**. Above the rent cells a radio group (WC / Default / BC) chooses which column feeds the calculations.  
- Vacancy/Occupancy% is displayed from the Revenue tab but can be temporarily edited here (per type).  
- Repeat the exact structure for **Parking Types** (type, space count, rent).  
- Totals update instantly based on the active scenario (WC/Default/BC + occupancy overrides).

### 11.2 Development Costs
- **Purchase Price** – read-only, from General tab.  
- **Hard Costs Total** – sum of Hard Costs tab (read-only).  
- **Soft Costs Total** – sum of Soft Costs tab (read-only).  
- **Buildable SqFt** – from General tab (read-only).  
- **Build Cost / SqFt (default)** = (Hard + Soft) / Buildable SqFt (read-only) but accompanied by editable WC and BC override inputs plus a radio selector (WC / Default / BC) that decides the number used downstream.

### 11.3 Carrying Costs
- Rows:
  - **Building Management** – pull the annualized amount from the Carrying Costs tab, then offer WC/Default/BC overrides + selector.
  - **Stabilized RE Tax** – specifically reference the “Stabilized RE Tax” entry from the Carrying Costs tab. Construction RE Tax is excluded here so NOI reflects steady-state operations.
- Both rows present inline WC/BC override inputs and a radio selector per row to choose which assumption drives the calculations.

### 11.4 Loan Assumptions
- Editable **Construction Period (months)** (default 24).  
- Editable **Interest Rate (%)** (default 6.25) – interest-only during construction.  
- **Founders Equity (GP Contribution)** – sum of GP contributions from the Funding tab (read-only).  
- **Construction Loan Amount** =  
  ```
  (Purchase Price + Selected Hard Cost + Selected Soft Cost)
  – GP Contributions
  + Construction RE Tax (annualized draw during construction period)
  + Interest accrued on loan during construction
  ```
  - Show a `% Loan-to-Project-Cost` badge calculated as (Loan Amount) / (Loan Amount + GP Contribution). Highlight in red if > 75%.

### 11.5 Metrics
- **NOI (Stabilized)** = Selected Revenue Total – Selected Property Tax (Stabilized) – Selected Management Fee.  
- **CAP Rate** = NOI / Total Project Cost (Loan Amount + GP Contribution).  
- Display the active scenario (WC / Default / BC) near the metrics. Each computed field includes the hover tooltip describing its formula.

### 11.6 Stabilized Cashflow & Refinance
- The final section lets you model the “in-service” loan that replaces the construction facility.
- Inputs:
  - Loan amount is pre-filled from the construction loan total.
  - Editable stabilized interest rate (default 5.25%) and amortization term (default 30 years).
  - Optional cash-out refinance field; increasing it bumps the loan balance and debt service in real time.
- Outputs:
  - Debt coverage ratio = `NOI / Annual Debt Service` (updates as you tweak the refi amount).
  - Annual / Monthly debt service and the resulting annual / monthly available cash (NOI minus debt service).

