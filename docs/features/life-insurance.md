# Life Insurance Policy Manager

status: Draft  
owner: Product  
last_updated: 2026-01-24

## 1. Overview

The Life Insurance Policy Manager is a tracking tool for managing whole life insurance policies as long-term financial assets. While the Real Estate Project Manager tracks physical development projects and the Business Project Manager tracks company-building ventures, this module tracks permanent life insurance policies that serve as tax-advantaged wealth-building vehicles.

Whole life insurance policies are unique financial instruments that combine:
- A death benefit (insurance protection)
- A cash value component (savings/investment)
- Dividend participation (for mutual company policies)

This tab helps users track policy performance, cash value growth, premium payments, and loan activity across multiple policies.

## 2. Objectives

- Centralize tracking of all whole life insurance policies in one dashboard
- Monitor cash value accumulation and growth rates over time
- Track premium payment schedules and status
- Manage policy loans and their impact on cash value
- Project future cash value based on dividend assumptions
- Provide a clear view of total death benefit coverage across all policies

## 3. Non-Goals

- Policy application or underwriting (handled by insurance carriers)
- Premium payment processing (handled externally)
- Automated data sync with insurance carriers (manual entry for MVP)
- Term life or universal life tracking (whole life focus only for now)
- Tax preparation or advice

## 4. Users

Same user base as the Real Estate and Business project managers. Users who hold whole life policies as part of their wealth-building strategy and want to track policy performance alongside their other investments.

## 5. Core Flows

1. **Add Policy**
   - Required fields: `policy_number`, `carrier`, `face_amount`
   - Opens a modal to capture basic policy information
   - Policy appears in the policies list after creation

2. **Policy List View**
   - Shows all policies with key metrics (carrier, face amount, current cash value)
   - Quick summary of total coverage and total cash value
   - Click to view policy details

3. **Policy Detail View**
   - Full policy information across multiple tabs
   - Cash value history and projections
   - Premium payment tracking
   - Loan activity

4. **Delete Policy**
   - Soft delete with confirmation modal
   - Cascade delete all child records (cash value entries, loan records)

## 6. Data Model

### 6.1 Policy Entity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `owner_id` | UUID | Yes | FK to users table |
| `policy_number` | TEXT | Yes | Carrier-assigned policy number |
| `carrier` | TEXT | Yes | Insurance company name |
| `face_amount` | DECIMAL | Yes | Death benefit amount |
| `issue_date` | DATE | Yes | Policy issue date |
| `insured_name` | TEXT | Yes | Name of insured person |
| `insured_dob` | DATE | No | Insured's date of birth |
| `policy_type` | ENUM | Yes | `whole_life`, `paid_up_additions` |
| `premium_amount` | DECIMAL | Yes | Annual/monthly premium |
| `premium_frequency` | ENUM | Yes | `monthly`, `quarterly`, `annual` |
| `dividend_option` | ENUM | No | `paid_up_additions`, `cash`, `premium_reduction`, `accumulate` |
| `is_participating` | BOOLEAN | Yes | Whether policy participates in dividends |
| `notes` | TEXT | No | Free-form notes |
| `created_at` | TIMESTAMP | Yes | Record creation time |
| `updated_at` | TIMESTAMP | Yes | Last update time |
| `deleted_at` | TIMESTAMP | No | Soft delete marker |

### 6.2 Cash Value History

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `policy_id` | UUID | Yes | FK to policies |
| `as_of_date` | DATE | Yes | Statement date |
| `cash_value` | DECIMAL | Yes | Total cash value |
| `surrender_value` | DECIMAL | No | Net surrender value after charges |
| `loan_balance` | DECIMAL | No | Outstanding loan amount |
| `paid_up_additions_value` | DECIMAL | No | Cash value from PUAs |
| `dividend_amount` | DECIMAL | No | Dividend credited this period |
| `created_at` | TIMESTAMP | Yes | Record creation time |

### 6.3 Policy Loans

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `policy_id` | UUID | Yes | FK to policies |
| `loan_date` | DATE | Yes | Date loan was taken |
| `loan_amount` | DECIMAL | Yes | Principal borrowed |
| `interest_rate` | DECIMAL | Yes | Loan interest rate |
| `repayment_date` | DATE | No | Date loan was repaid |
| `repayment_amount` | DECIMAL | No | Amount repaid |
| `purpose` | TEXT | No | Reason for loan |
| `created_at` | TIMESTAMP | Yes | Record creation time |

### 6.4 Premium Payments

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `policy_id` | UUID | Yes | FK to policies |
| `payment_date` | DATE | Yes | Date payment made |
| `amount` | DECIMAL | Yes | Payment amount |
| `payment_type` | ENUM | Yes | `base_premium`, `pua_rider`, `loan_repayment` |
| `notes` | TEXT | No | Payment notes |
| `created_at` | TIMESTAMP | Yes | Record creation time |

## 7. Tab Structure (per Policy)

### 7.1 Overview Tab
- Policy summary card (carrier, policy number, face amount)
- Current cash value vs. total premiums paid (return on investment)
- Key dates (issue date, next premium due)
- Quick stats: total dividends earned, loan balance

### 7.2 Cash Value Tab
- Historical cash value chart (line graph over time)
- Table of cash value snapshots from annual statements
- Growth rate calculation (year-over-year, compound)
- Breakdown: base cash value vs. PUA value

### 7.3 Premiums Tab
- Premium payment history table
- Upcoming payment schedule
- Total premiums paid to date
- Premium breakdown (base premium vs. PUA rider)

### 7.4 Loans Tab
- Active loan summary (balance, interest accruing)
- Loan history table
- Impact calculator (show effect of loan on death benefit and cash value)
- Repayment tracking

### 7.5 Projections Tab
- Future cash value projections based on assumed dividend rates
- Scenario comparison (conservative vs. current vs. optimistic dividends)
- Paid-up date calculator (when policy can be self-sustaining)

### 7.6 Documents Tab
- Link to annual statements (external URLs)
- Policy contract documents
- Dividend notices
- Same structure as Real Estate Docs tab

## 8. Dashboard Summary View

The main Life Insurance tab shows a dashboard of all policies:

```
┌─────────────────────────────────────────────────────────────────┐
│  Life Insurance Policies                    [+ Add Policy]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TOTAL COVERAGE          TOTAL CASH VALUE       TOTAL PREMIUMS  │
│  $2,500,000              $185,000               $95,000         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Northwestern Mutual - Policy #12345678                   │  │
│  │ Face: $1,000,000  │  Cash Value: $125,000  │  Since 2018 │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ MassMutual - Policy #87654321                            │  │
│  │ Face: $1,500,000  │  Cash Value: $60,000   │  Since 2021 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 9. Integration Points

### Shared Infrastructure
- Same authentication system as Real Estate and Business projects
- Same document storage pattern (external URLs)
- Same user ownership model

### Board Visibility
- Life Insurance tab appears only if user has at least one policy
- Follows the same "no empty boards" principle as Business projects

## 10. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/life-insurance/policies` | List user's policies |
| `POST` | `/api/life-insurance/policies` | Create new policy |
| `GET` | `/api/life-insurance/policies/:id` | Get policy details |
| `PATCH` | `/api/life-insurance/policies/:id` | Update policy |
| `DELETE` | `/api/life-insurance/policies/:id` | Soft delete policy |
| `GET` | `/api/life-insurance/policies/:id/cash-values` | Get cash value history |
| `POST` | `/api/life-insurance/policies/:id/cash-values` | Add cash value snapshot |
| `GET` | `/api/life-insurance/policies/:id/loans` | Get loan history |
| `POST` | `/api/life-insurance/policies/:id/loans` | Record new loan |
| `PATCH` | `/api/life-insurance/policies/:id/loans/:loanId` | Update loan (repayment) |

## 11. Future Enhancements

### Phase 2
- Import from carrier statements (CSV/PDF parsing)
- Automated dividend tracking
- Policy comparison tools
- Multiple insured tracking (family policies)

### Phase 3
- Integration with financial planning tools
- Estate planning views (beneficiary tracking)
- 1035 exchange tracking
- Universal life support

## 12. Changelog

- `2026-01-24` – Initial draft specification for Life Insurance Policy Manager
