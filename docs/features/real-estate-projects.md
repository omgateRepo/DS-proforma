# Real Estate Project Manager
status: Draft  
owner: Product  
last_updated: 2025-11-26

## 1. Overview
Operate a single web application that tracks multifamily real-estate deals from sourcing through stabilization. Users can add/delete projects, manage their position on a Kanban board, and capture detailed revenue/cost data for each project.

## 2. Objectives
- Centralize every deal with an auditable lifecycle (New → Offer Submitted → In Progress → Stabilized).
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
   - Columns: New, Offer Submitted, In Progress, Stabilized.  
   - Cards show name + key stats (units, current rent, total cost).  
   - Drag-and-drop (or dropdown) to change stage; record timestamp in history table.  
   - The Kanban view is dedicated: it shows only the board plus the global “Add Project” button (full-width layout with generous spacing). Selecting a card navigates to the project detail view (no split-pane).
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

## 6. Tab-Level Requirements

### 6.1 General Tab
- Fields:
  - `address_line1`, `address_line2`, `city`, `state`, `zip`.
  - `property_type` (land, existing building).
  - `description` / notes.
  - `purchase_price_usd`, `closing_date`.
    - Closing date uses a date picker (month/day/year) so timelines align with cashflow modeling.
  - `latitude`, `longitude` – captured from the address autocomplete (editable if adjustments needed). Used for satellite preview and mapping context.
  - `target_units`, `target_sqft`.
  - `sponsor` (future, for LP/GP tracking).
- Actions: edit inline, save/cancel, upload hero photo (future).

### 6.2 Revenue Tab
- Clicking the **Add** button now presents three options:
  1. **Apartment Type** (formerly “unit type”) – multi-unit rents (e.g., 1bd/1bth).
  2. **Parking Type** – structured like apartment types but for parking variations (garage, uncovered, etc.).
  3. **GP Contribution** – one-time capital infusions from partners (Darmon or Sherman).
- Apartment/Parking forms capture:
  - `type_label` (e.g., "1bd/1bth" or "Garage Parking").
  - `unit_sqft` (optional for apartments, still tracked for reference).
  - `unit_count`.
  - `monthly_rent_usd` (budget).
  - `vacancy_pct` (default 5%).
  - `start_month` (integer month offset; revenue hits cashflow starting that month). As the user types/selects a month number, the UI shows `Month N • Month/Year` so you always know which calendar month you’re targeting (closing month is Month 1).
- Parking omits square footage by default but keeps the same scheduling semantics (start month + vacancy). Revenue is calculated the same way (`rent * count * (1 - vacancy)`).
- GP contribution form captures:
  - `partner` option (Darmon or Sherman).
  - `amount_usd`.
  - `contribution_month` (single month index when the cash comes in). Contributions only hit the cashflow once.
- Listing UI is grouped by category (Apartments, Parking, GP Contributions) with per-section totals and the overall monthly revenue summary.
- Cashflow integration:
  - Apartment/Parking lines start at their configured month; before that they contribute zero.
  - GP contributions inject a single-month inflow in the cashflow grid.
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
- Each entry can schedule money exactly like soft costs (single month, range, multi-month with optional % allocation). Totals roll into the cashflow grid immediately.
- Every month input (single start month, range boundaries, multi-month lists) displays the Month N + calendar month hint in real time, so users don’t have to mentally translate offsets back to the calendar.

### 6.4 Soft Costs Tab
- Same structure as Hard Costs but flagged with category (Architect, Legal, Permits).  
- Payment scheduling options (modal-driven):
  - **Single month:** enter one integer offset (month index).
  - **Range:** specify start and end month (inclusive). The amount is spread evenly unless custom percentages are provided.
  - **Multiple months:** comma-separated month indexes (e.g., `0,1,2`). When multiple months are chosen, optionally specify the percentage of the total allocated per month (must add up to 100%).
- These options let finance teams stage retainers, progress draws, or recurring soft costs without juggling separate entries.

### 6.5 Carrying Costs Tab
The Carrying tab now mirrors the Revenue tab’s pattern: a single **Add** menu that lets users pick which cost bucket to add rows under. Supported buckets (MVP):

1. **Loans**
2. **Property Tax**
3. **Management Fees**

Each bucket renders its own table with per-line totals plus a modal for add/edit (consistent UI with other tabs). Delete controls remain hidden (global rule) except within the modal confirmation step.

#### 6.5.1 Loans
- **Item Structure**
  - `title` (freeform, e.g., “Bridge Loan A”).
  - `loan_mode`: `interest_only` or `amortizing`.
  - `loan_amount_usd`.
  - `loan_term_months` (integer).
  - `interest_rate_pct` (APR).
  - `funding_month` (month offset when proceeds hit the cashflow; displays Month N + calendar hint like other inputs).
  - `repayment_start_month` (first month debt service leaves the account).
- **Cashflow Behavior**
  - Funding month injects a positive inflow equal to `loan_amount_usd` (shown on the cashflow grid under Carrying Costs → Loans → `Funding` line so it still groups with the debt story).
  - For **amortizing loans**:
    - Compute a level monthly payment using the standard amortization formula.
    - Split each month’s payment into two sub-lines in the Carrying Costs section: `Loan – Interest` and `Loan – Principal`.
    - Continue until the term ends or the balance hits zero.
  - For **interest-only loans**:
    - Monthly outflow = `loan_amount_usd * rate / 12` (still rendered as the `Loan – Interest` sub-line).
    - During the month immediately **before** the term ends, insert a lump-sum outflow equal to the original principal labeled `Loan – Principal Payoff`.

#### 6.5.2 Property Tax
- **Fields**
  - `title` (optional helper text, defaults to “Property Tax” if blank).
  - `amount_usd` (per interval).
  - `start_month`.
  - `end_month` (optional; if omitted the item continues through the 60-month grid).
  - `interval_unit`: `monthly`, `quarterly`, or `yearly`.
- **Cashflow Behavior**
  - Normalize the amount to a monthly series based on the interval.
    - Monthly = amount every month.
    - Quarterly = amount every 3 months.
    - Yearly = amount every 12 months.
  - Respect start/end months when plotting to the grid.

#### 6.5.3 Management Fees
- **Fields**
  - `title` (required; e.g., “Leasing Management”).
  - `amount_usd` (per interval).
  - `start_month`.
  - `end_month` (optional).
  - `interval_unit`: `monthly`, `quarterly`, `yearly`.
- **Cashflow Behavior**
  - Same interval logic as Property Tax.
  - These rows appear under Carrying Costs → Management with per-line totals and flow into the aggregated Carrying Costs row.

#### 6.5.4 UI & Validation Notes
- All month-entry controls reuse the shared helpers so they show `Month N • Calendar Month`.
- Loan modal validates that `funding_month <= repayment_start_month` and `loan_term_months > 0`.
- Property Tax + Management modals ensure `start_month <= end_month` when an end month is provided.
- Modals disclose how amounts map to the cashflow (e.g., “Quarterly • $45,000 posts every Month 3 starting Month 4”).
- Carrying Costs table shows grouped totals per bucket plus the combined monthly impact.

### 6.6 Cashflow Tab
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

## 7. Data Model

### 7.1 Entities

| Table | Key Fields | Notes |
| --- | --- | --- |
| `projects` | `id (uuid)`, `name`, `stage`, `address_line1`, `city`, `state`, `zip`, `property_type`, `purchase_price_usd`, `target_units`, `target_sqft`, `created_at`, `updated_at`, `deleted_at` | Stage enum: `new`, `offer_submitted`, `in_progress`, `stabilized`. |
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
  "stage": "in_progress",
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
2. Should stage transitions enforce required data (e.g., must have rent roll before entering In Progress)?  
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

