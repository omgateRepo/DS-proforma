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
- Each entry represents a unit type. Creating/editing rows happens inside a modal so the tab stays clean.
- Fields captured:
  - `type_label` (e.g., "1bd/1bth").
  - `unit_sqft`.
  - `unit_count`.
  - `monthly_rent_usd` (budget).
  - `vacancy_pct` (default 5%). Revenue for the line is `monthly_rent_usd * unit_count * (1 - vacancy_pct/100)`.
  - Optional future: `actual_monthly_rent_usd`.
- Listing UI shows:
  - Base rent, vacancy %, net monthly revenue per line, and per-line total (net monthly * unit_count).
  - Summary footer with overall monthly revenue total (sum of net line revenues).
- Bulk actions: duplicate row, delete row, apply % increase.
- Each revenue row can be edited via the same modal (pre-populate existing values, allow vacancy override). Save writes back to the API.

### 6.3 Hard Costs Tab
- Free-form line items with:
  - `cost_name`.
  - `amount_usd`.
  - `payment_month` (integer offset from project start, e.g., month 0-36).  
- Support grouping (Foundation, Framing, MEP).  
- Show running total and highlight over-budget items once actuals recorded.

### 6.4 Soft Costs Tab
- Same structure as Hard Costs but flagged with category (Architect, Legal, Permits).  
- Payment scheduling options (modal-driven):
  - **Single month:** enter one integer offset (month index).
  - **Range:** specify start and end month (inclusive). The amount is spread evenly unless custom percentages are provided.
  - **Multiple months:** comma-separated month indexes (e.g., `0,1,2`). When multiple months are chosen, optionally specify the percentage of the total allocated per month (must add up to 100%).
- These options let finance teams stage retainers, progress draws, or recurring soft costs without juggling separate entries.

### 6.5 Carrying Costs Tab
- Each item requires a `type` selected from:
  - `construction_loan`
  - `stabilized_loan`
  - `real_estate_tax`
  - `insurance`
  - `other`
- For loan types (construction/stabilized):
  - Fields: `principal_amount_usd`, `interest_rate_pct`, `term_years`, `start_date`.
  - Derived: monthly debt service (simple amortization placeholder until we integrate a proper loan model).
- For non-loan types (tax, insurance, other):
  - Fields: `amount_usd`, `start_date`, `interval` (monthly, quarterly, annual).
  - Derived: normalized monthly amount (amount / interval frequency).

### 6.6 Cashflow Tab
- 60-month horizontal grid starting at month 0 (closing month). Months run left-to-right as column headers (M0…M59) with friendly month/year labels in tooltips.  
- Rows are grouped (and color-coded) by category: Revenues, Soft Costs, Hard Costs, Carrying Costs, and Total. Additional sub-rows can be added later (e.g., specific loans) but these five anchors always show.  
- Soft-cost modal drives the Soft Costs row:
  - **Single** month → entire amount sits in that month.
  - **Range** → amount spread evenly across the inclusive window.
  - **Multiple months** → split evenly or by user-defined percentages that must add up to 100%.
- Revenue row currently uses the net monthly rent (from Revenue tab) applied to each month; later we can layer in lease-up ramps or vacancy shocks.
- Hard and Carrying costs are placeholders until those tabs ship; they’ll pull from their respective datasets automatically.
- Totals row = Revenues + all expenses for each month, letting the user see net cashflow instantly.
- Data refresh is immediate—updating a soft cost or revenue re-renders the 60-month sheet.
- Allow manual adjustments (e.g., equity injection).  
- Export to CSV later.

## 7. Data Model

### 7.1 Entities

| Table | Key Fields | Notes |
| --- | --- | --- |
| `projects` | `id (uuid)`, `name`, `stage`, `address_line1`, `city`, `state`, `zip`, `property_type`, `purchase_price_usd`, `target_units`, `target_sqft`, `created_at`, `updated_at`, `deleted_at` | Stage enum: `new`, `offer_submitted`, `in_progress`, `stabilized`. |
| `project_stage_history` | `id`, `project_id`, `from_stage`, `to_stage`, `changed_by`, `changed_at` | Append-only log for analytics. |
| `apartment_types` | `id`, `project_id`, `type_label`, `unit_sqft`, `unit_count`, `rent_budget`, `rent_actual` | Revenue tab rows. |
| `cost_items` | `id`, `project_id`, `category` (`hard`, `soft`, `carrying`), `cost_name`, `amount_usd`, `payment_month`, `start_month`, `end_month`, `carrying_type`, `principal_amount_usd`, `interest_rate_pct`, `term_years`, `interval`, `start_date` | For carrying costs, certain columns apply depending on `carrying_type`. |
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

