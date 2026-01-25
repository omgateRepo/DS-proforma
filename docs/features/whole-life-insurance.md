# Whole Life Insurance: Definitions, Calculations, and Projections

This document provides comprehensive definitions, calculation methodologies, and projection formulas for **Standard Whole Life Insurance** policies. It serves as the reference for building year-over-year cash value and death benefit projections.

## Overview

### What is Standard Whole Life Insurance?

Standard Whole Life Insurance is a type of **permanent life insurance** that provides:
1. A guaranteed death benefit for the insured's entire lifetime (as long as premiums are paid)
2. A cash value component that grows over time on a tax-advantaged basis
3. Level (fixed) premiums that never increase
4. Guaranteed cash value accumulation schedule

Unlike term life insurance which expires after a set period, whole life insurance is designed to last for the insured's entire life and builds equity over time.

### Why Standard Whole Life for Projections?

Standard Whole Life is the most predictable form of permanent life insurance because:
- **Fixed premiums** – Known payment amount for the life of the policy
- **Guaranteed cash values** – Published schedule of minimum cash values by year
- **Guaranteed death benefit** – Fixed face amount (unless modified by loans)
- **Predictable mortality charges** – Based on published mortality tables
- **No interest rate risk** – Unlike Universal Life products

This predictability makes Standard Whole Life ideal for long-term financial projections.

---

## Projection Input Parameters

To generate year-over-year projections, the following inputs are required:

### Required Inputs

| Parameter | Description | Example |
|-----------|-------------|---------|
| **Issue Age** | Age of insured when policy starts | 35 |
| **Face Amount** | Initial death benefit amount | $500,000 |
| **Annual Premium** | Yearly premium payment | $8,500 |
| **Premium Payment Years** | Number of years premiums will be paid | 20 |
| **Sex** | Male or Female (affects mortality rates) | Male |
| **Health Class** | Preferred Plus, Preferred, Standard, etc. | Standard |

### Optional Inputs

| Parameter | Description | Default |
|-----------|-------------|---------|
| **Dividend Rate** | Expected annual dividend rate (participating policies) | 5.0% |
| **Dividend Option** | How dividends are applied | Paid-Up Additions |
| **Loan Interest Rate** | Interest charged on policy loans | 6.0% |
| **Projection End Age** | Age to project through | 100 |

### Loan/Withdrawal Schedule (Optional)

| Parameter | Description | Example |
|-----------|-------------|---------|
| **Withdrawal Age** | Age when loan/withdrawal starts | 65 |
| **Withdrawal Amount** | Annual amount to withdraw | $25,000 |
| **Withdrawal Years** | Number of years to withdraw | 20 |
| **Withdrawal Type** | Loan or Partial Surrender | Loan |

---

## Core Calculation Components

### 1. Mortality Cost (Cost of Insurance - COI)

The mortality cost is the pure insurance cost that increases with age. It represents the risk the insurance company takes on.

#### Mortality Tables

Standard Whole Life uses actuarial mortality tables. The most common are:
- **2017 CSO (Commissioners Standard Ordinary)** – Current industry standard
- **2001 CSO** – Previous standard, still used for some policies

#### Mortality Rate by Age (2017 CSO - Male, Non-Smoker)

| Age | Deaths per 1,000 | Age | Deaths per 1,000 |
|-----|------------------|-----|------------------|
| 25 | 0.49 | 55 | 4.96 |
| 30 | 0.61 | 60 | 7.96 |
| 35 | 0.78 | 65 | 12.51 |
| 40 | 1.09 | 70 | 19.89 |
| 45 | 1.71 | 75 | 32.36 |
| 50 | 2.88 | 80 | 53.88 |

#### COI Calculation Formula

```
Annual COI = (Net Amount at Risk × Mortality Rate per 1,000) / 1,000

Where:
Net Amount at Risk (NAR) = Death Benefit - Cash Value
```

**Example:**
- Age: 45
- Death Benefit: $500,000
- Cash Value: $50,000
- Net Amount at Risk: $450,000
- Mortality Rate (age 45): 1.71 per 1,000

```
Annual COI = ($450,000 × 1.71) / 1,000 = $769.50
```

**Key Insight:** As cash value grows, the Net Amount at Risk decreases, which partially offsets the increasing mortality rate with age.

### 2. Premium Allocation

Each premium payment is allocated across multiple components:

```
Annual Premium = COI + Expense Load + Cash Value Contribution

Where:
- COI = Cost of Insurance (mortality charge)
- Expense Load = Administrative costs + commissions + profit margin
- Cash Value Contribution = Amount added to policy reserves
```

#### Typical Allocation Breakdown (Standard Whole Life)

| Policy Year | COI % | Expense Load % | Cash Value % |
|-------------|-------|----------------|--------------|
| 1 | 5-10% | 80-90% | 5-15% |
| 2 | 5-10% | 30-40% | 50-60% |
| 3-5 | 8-15% | 15-25% | 60-75% |
| 6-10 | 10-20% | 10-15% | 65-80% |
| 11-20 | 15-30% | 5-10% | 60-80% |
| 21+ | 20-50% | 3-5% | 45-75% |

**Note:** First-year expenses are high due to agent commissions and underwriting costs.

### 3. Expense Load Components

| Component | Description | Typical Amount |
|-----------|-------------|----------------|
| **Agent Commission** | First year: 50-100% of premium; Renewal: 2-5% | Varies |
| **Underwriting** | Medical exams, background checks | $200-500 first year |
| **Policy Administration** | Annual maintenance | $50-150/year |
| **Premium Tax** | State tax on premiums | 2-3% of premium |
| **Profit Margin** | Company profit | 5-15% of premium |

### 4. Guaranteed Interest Rate

Standard Whole Life policies guarantee a minimum interest rate on cash value:
- **Typical guaranteed rate:** 3.0% - 4.0% annually
- This rate is contractually guaranteed for the life of the policy
- Actual credited rate may be higher (through dividends)

---

## Cash Value Accumulation

### Year-Over-Year Cash Value Formula

For each policy year, cash value is calculated as:

```
CV[year] = CV[year-1] + Premium_Contribution + Interest_Credited - COI - Expenses

Where:
CV[year] = Cash Value at end of year
CV[year-1] = Cash Value at end of previous year (0 for year 1)
Premium_Contribution = Premium × Allocation_Rate
Interest_Credited = CV[year-1] × Guaranteed_Interest_Rate
COI = Cost of Insurance for current age
Expenses = Administrative expenses for year
```

### Simplified Projection Model

For projection purposes, use this simplified model:

```
CV[year] = CV[year-1] × (1 + Interest_Rate) + (Premium × CV_Factor[year]) - COI[age]

Where:
CV_Factor[year] = Percentage of premium going to cash value (varies by year)
COI[age] = Cost of insurance based on current age
```

#### Cash Value Factor Table (Approximation)

| Policy Year | CV Factor | Notes |
|-------------|-----------|-------|
| 1 | 0.10 | High first-year expenses |
| 2 | 0.55 | Transition year |
| 3 | 0.65 | |
| 4 | 0.70 | |
| 5 | 0.72 | |
| 6-10 | 0.75 | Stabilizing |
| 11-20 | 0.78 | Mature policy |
| 21+ | 0.80 | Fully mature |

### Cash Value Projection Example

**Inputs:**
- Issue Age: 35
- Face Amount: $500,000
- Annual Premium: $8,500
- Guaranteed Interest: 4.0%

| Year | Age | Premium | CV Factor | CV Contribution | Interest | COI | Year-End CV |
|------|-----|---------|-----------|-----------------|----------|-----|-------------|
| 1 | 35 | $8,500 | 0.10 | $850 | $0 | $390 | $460 |
| 2 | 36 | $8,500 | 0.55 | $4,675 | $18 | $396 | $4,757 |
| 3 | 37 | $8,500 | 0.65 | $5,525 | $190 | $402 | $10,070 |
| 4 | 38 | $8,500 | 0.70 | $5,950 | $403 | $410 | $16,013 |
| 5 | 39 | $8,500 | 0.72 | $6,120 | $641 | $418 | $22,356 |
| 10 | 44 | $8,500 | 0.75 | $6,375 | $2,100 | $520 | $54,500 |
| 15 | 49 | $8,500 | 0.78 | $6,630 | $4,200 | $750 | $110,000 |
| 20 | 54 | $8,500 | 0.80 | $6,800 | $6,800 | $1,100 | $175,000 |

---

## Death Benefit Calculations

### Base Death Benefit

For Standard Whole Life, the death benefit remains level (unless modified):

```
Net Death Benefit = Face Amount - Outstanding Loans
```

### Death Benefit with Paid-Up Additions

If dividends purchase PUAs:

```
Total Death Benefit = Base Face Amount + PUA Death Benefit - Outstanding Loans
```

### Death Benefit Over Time (No Loans)

| Year | Age | Base Face Amount | PUA Death Benefit* | Total Death Benefit |
|------|-----|------------------|-------------------|---------------------|
| 1 | 35 | $500,000 | $0 | $500,000 |
| 5 | 39 | $500,000 | $5,000 | $505,000 |
| 10 | 44 | $500,000 | $15,000 | $515,000 |
| 15 | 49 | $500,000 | $30,000 | $530,000 |
| 20 | 54 | $500,000 | $50,000 | $550,000 |

*Assumes 5% dividend rate with PUA option

---

## Policy Loans and Withdrawals

### Policy Loan Mechanics

When a loan is taken against the policy:

```
Available Loan Amount = Cash Value × Loan-to-Value Ratio (typically 90-95%)

Loan Interest Accrual:
Loan_Balance[year] = Loan_Balance[year-1] × (1 + Loan_Interest_Rate)
```

### Impact of Loans on Projections

| Item | Impact |
|------|--------|
| **Cash Value** | Continues to grow (NOT reduced by loan) |
| **Death Benefit** | Reduced by loan balance |
| **Dividends** | May be reduced (direct recognition companies) |
| **Policy Status** | Lapses if loan balance > cash value |

### Loan Projection Formula

For each year with an outstanding loan:

```
Loan_Balance[year] = (Loan_Balance[year-1] + New_Loan) × (1 + Loan_Interest_Rate) - Repayments

Net Death Benefit[year] = Total Death Benefit - Loan_Balance[year]

Net Cash Value (Surrender) = Cash Value - Loan_Balance
```

### Withdrawal (Partial Surrender) vs. Loan

| Aspect | Policy Loan | Partial Surrender |
|--------|-------------|-------------------|
| **Effect on Cash Value** | No reduction | Reduces cash value |
| **Tax Treatment** | Tax-free (if policy stays in force) | Taxable if above basis |
| **Interest** | Yes, charged on loan | No |
| **Repayment** | Optional | N/A (permanent) |
| **Effect on Death Benefit** | Reduced by loan balance | Reduced permanently |

### Loan Projection Example

**Scenario:** Take $25,000 annual loans from age 65-84 (20 years)

| Age | Beginning Loan | New Loan | Interest (6%) | Year-End Loan | Cash Value | Net CV |
|-----|----------------|----------|---------------|---------------|------------|--------|
| 65 | $0 | $25,000 | $1,500 | $26,500 | $200,000 | $173,500 |
| 66 | $26,500 | $25,000 | $3,090 | $54,590 | $212,000 | $157,410 |
| 70 | $120,000 | $25,000 | $8,700 | $153,700 | $250,000 | $96,300 |
| 75 | $280,000 | $25,000 | $18,300 | $323,300 | $300,000 | **-$23,300** |

**Warning:** At age 75, loan exceeds cash value = **POLICY LAPSE RISK**

---

## MEC (Modified Endowment Contract) Compliance

### What is the 7-Pay Test?

The IRS created the 7-Pay Test to prevent life insurance from being used primarily as a tax shelter. A policy becomes a MEC if cumulative premiums paid exceed the "7-Pay Premium" limit.

### 7-Pay Premium Calculation

The 7-Pay Premium is the level annual premium that would pay up the policy in exactly 7 years.

```
7-Pay Premium = Net Single Premium / äx:7|

Where:
- Net Single Premium = Present value of future death benefits
- äx:7| = Present value of 7 annual payments of $1
```

### Simplified 7-Pay Limit Table

| Issue Age | 7-Pay Limit per $1,000 Face Amount |
|-----------|-----------------------------------|
| 25 | $12.50 |
| 30 | $13.80 |
| 35 | $15.40 |
| 40 | $17.50 |
| 45 | $20.20 |
| 50 | $23.80 |
| 55 | $28.50 |
| 60 | $35.00 |
| 65 | $44.00 |

### MEC Test Calculation

```
7-Pay Limit = (Face Amount / 1,000) × 7-Pay Rate for Issue Age

Policy Status:
- If Cumulative Premiums ≤ 7-Pay Limit × Years (up to 7): NOT a MEC
- If Cumulative Premiums > 7-Pay Limit × Years: IS a MEC
```

### MEC Test Example

**Policy Details:**
- Issue Age: 40
- Face Amount: $500,000
- Annual Premium: $12,000

**Calculation:**
```
7-Pay Limit = ($500,000 / 1,000) × $17.50 = $8,750 per year

Year-by-Year Test:
Year 1: $12,000 paid vs. $8,750 limit = EXCEEDS LIMIT → MEC!
```

**This policy would be classified as a MEC from inception.**

### MEC Alert Thresholds

| Alert Level | Condition | Action |
|-------------|-----------|--------|
| **Safe** | Cumulative Premium < 80% of limit | Green |
| **Warning** | Cumulative Premium 80-95% of limit | Yellow - caution |
| **Danger** | Cumulative Premium 95-100% of limit | Red - near MEC |
| **MEC** | Cumulative Premium > limit | Policy is a MEC |

### MEC Consequences

If a policy becomes a MEC:

| Aspect | Non-MEC Treatment | MEC Treatment |
|--------|-------------------|---------------|
| **Loans** | Tax-free | Taxed as income (LIFO) |
| **Withdrawals** | Tax-free up to basis | Taxed as income first |
| **Early Distribution** | No penalty | 10% penalty if under 59½ |
| **Death Benefit** | Tax-free | Still tax-free |

### Avoiding MEC Status

1. **Pay exactly the base premium** – Don't overfund
2. **Spread PUA payments** – Don't front-load
3. **Increase face amount** – Higher face = higher 7-Pay limit
4. **Use a higher-face policy** – More "room" for premiums

---

## Complete Projection Model

### Year-Over-Year Projection Algorithm

For each policy year from issue to projection end:

```python
def project_year(year, prev_state, inputs):
    age = inputs.issue_age + year - 1
    
    # 1. Calculate COI
    mortality_rate = get_mortality_rate(age, inputs.sex, inputs.health_class)
    net_amount_at_risk = prev_state.death_benefit - prev_state.cash_value
    coi = (net_amount_at_risk * mortality_rate) / 1000
    
    # 2. Calculate premium contribution (if still paying)
    if year <= inputs.premium_payment_years:
        premium = inputs.annual_premium
        cv_factor = get_cv_factor(year)
        premium_contribution = premium * cv_factor
    else:
        premium = 0
        premium_contribution = 0
    
    # 3. Calculate interest
    interest = prev_state.cash_value * inputs.guaranteed_rate
    
    # 4. Calculate dividends (if participating)
    if inputs.is_participating:
        dividend = prev_state.cash_value * inputs.dividend_rate
    else:
        dividend = 0
    
    # 5. Calculate new cash value
    new_cash_value = prev_state.cash_value + premium_contribution + interest + dividend - coi
    
    # 6. Handle loans/withdrawals
    if age >= inputs.withdrawal_start_age and age < inputs.withdrawal_end_age:
        new_loan = inputs.withdrawal_amount
    else:
        new_loan = 0
    
    loan_interest = prev_state.loan_balance * inputs.loan_interest_rate
    new_loan_balance = prev_state.loan_balance + new_loan + loan_interest
    
    # 7. Check for lapse
    if new_loan_balance > new_cash_value:
        return POLICY_LAPSED
    
    # 8. Calculate death benefit
    pua_death_benefit = calculate_pua_death_benefit(dividend, age)
    total_death_benefit = inputs.face_amount + pua_death_benefit
    net_death_benefit = total_death_benefit - new_loan_balance
    
    # 9. MEC test
    cumulative_premiums = prev_state.cumulative_premiums + premium
    seven_pay_limit = calculate_seven_pay_limit(inputs.face_amount, inputs.issue_age, year)
    is_mec = cumulative_premiums > seven_pay_limit
    
    return {
        year: year,
        age: age,
        premium_paid: premium,
        cumulative_premiums: cumulative_premiums,
        cash_value: new_cash_value,
        death_benefit: net_death_benefit,
        loan_balance: new_loan_balance,
        net_surrender_value: new_cash_value - new_loan_balance,
        is_mec: is_mec,
        mec_headroom: seven_pay_limit - cumulative_premiums
    }
```

### Sample 30-Year Projection Output

**Inputs:**
- Issue Age: 35, Male, Standard
- Face Amount: $500,000
- Annual Premium: $8,000 (below MEC limit)
- Premium Years: 20
- Guaranteed Rate: 4%
- Dividend Rate: 5%
- Loan Start Age: 65
- Annual Loan: $20,000

| Year | Age | Premium | Cumulative | Cash Value | Death Benefit | Loan Balance | Net CV | MEC Status |
|------|-----|---------|------------|------------|---------------|--------------|--------|------------|
| 1 | 35 | $8,000 | $8,000 | $800 | $500,000 | $0 | $800 | Safe |
| 5 | 39 | $8,000 | $40,000 | $22,000 | $502,000 | $0 | $22,000 | Safe |
| 10 | 44 | $8,000 | $80,000 | $55,000 | $508,000 | $0 | $55,000 | Safe |
| 15 | 49 | $8,000 | $120,000 | $105,000 | $518,000 | $0 | $105,000 | Safe |
| 20 | 54 | $8,000 | $160,000 | $170,000 | $532,000 | $0 | $170,000 | Safe |
| 25 | 59 | $0 | $160,000 | $220,000 | $545,000 | $0 | $220,000 | Safe |
| 30 | 64 | $0 | $160,000 | $280,000 | $560,000 | $0 | $280,000 | Safe |
| 31 | 65 | $0 | $160,000 | $295,000 | $560,000 | $21,200 | $273,800 | Safe |
| 35 | 69 | $0 | $160,000 | $350,000 | $575,000 | $110,000 | $240,000 | Safe |
| 40 | 74 | $0 | $160,000 | $420,000 | $590,000 | $225,000 | $195,000 | Safe |
| 45 | 79 | $0 | $160,000 | $500,000 | $600,000 | $380,000 | $120,000 | Safe |

---

## Key Formulas Reference

### Cash Value
```
CV[n] = CV[n-1] × (1 + r) + P × f[n] + D - COI[age]

Where:
CV = Cash Value
r = Guaranteed interest rate
P = Annual premium (0 if paid up)
f[n] = Cash value factor for year n
D = Dividend (if participating)
COI = Cost of insurance
```

### Cost of Insurance
```
COI = (DB - CV) × q[age] / 1000

Where:
DB = Death Benefit
CV = Cash Value
q[age] = Mortality rate per 1,000 at current age
```

### Net Death Benefit
```
Net DB = Base Face + PUA Face - Loan Balance
```

### Loan Balance
```
Loan[n] = (Loan[n-1] + New_Loan) × (1 + loan_rate) - Repayments
```

### MEC 7-Pay Test
```
7-Pay Limit = Face × (7-Pay Rate / 1000) × min(year, 7)
MEC Status = Cumulative Premiums > 7-Pay Limit
```

### Net Surrender Value
```
Net Surrender = Cash Value - Loan Balance - Surrender Charges
```

---

## Glossary of Standard Whole Life Terms

| Term | Definition |
|------|------------|
| **7-Pay Test** | IRS test to determine if policy is a MEC |
| **Attained Age** | Current age of the insured |
| **Beneficiary** | Person(s) designated to receive death benefit |
| **Cash Surrender Value** | Cash value minus any surrender charges and loans |
| **Cost Basis** | Total premiums paid; used for tax calculations |
| **Cost of Insurance (COI)** | Monthly/annual charge for mortality risk |
| **CSO Table** | Commissioners Standard Ordinary mortality table |
| **Death Benefit** | Amount paid upon death of insured |
| **Dividend** | Return of excess premium (participating policies) |
| **Face Amount** | Original death benefit amount |
| **General Account** | Insurance company's investment portfolio |
| **Guaranteed Cash Value** | Minimum cash value per policy contract |
| **Guaranteed Interest Rate** | Minimum interest credited to cash value |
| **Illustration** | Projection of future policy values |
| **In-Force** | Active policy status |
| **Issue Age** | Age when policy was purchased |
| **Lapse** | Policy termination due to non-payment or excess loans |
| **Loan Interest Rate** | Interest charged on policy loans |
| **Loan-to-Value (LTV)** | Maximum loan as percentage of cash value |
| **MEC (Modified Endowment Contract)** | Overfunded policy with adverse tax treatment |
| **Mortality Rate** | Probability of death at a given age |
| **Net Amount at Risk (NAR)** | Death benefit minus cash value |
| **Non-Participating** | Policy that doesn't pay dividends |
| **Paid-Up** | Policy requiring no further premiums |
| **Paid-Up Addition (PUA)** | Additional insurance purchased with dividends |
| **Participating** | Policy eligible for dividends |
| **Policy Loan** | Loan using cash value as collateral |
| **Premium** | Payment to keep policy in force |
| **Surrender Charge** | Fee for early policy termination |
| **Underwriting** | Risk assessment process |

---

## Data Sources and Assumptions

### Mortality Tables
- Primary: 2017 CSO (Commissioners Standard Ordinary)
- Alternative: 2001 CSO for older policies

### Interest Rate Assumptions
- Guaranteed Rate: 3.0% - 4.0% (per policy contract)
- Current Dividend Rate: 4.5% - 6.0% (varies by company)
- Loan Interest Rate: 5.0% - 8.0%

### Expense Assumptions
- First Year Expenses: 80-100% of first premium
- Renewal Expenses: 5-10% of premium
- Per-Policy Charge: $50-150 annually

### Projection Limitations

1. **Dividends are not guaranteed** – Projections assume current rates continue
2. **Mortality tables are averages** – Individual results vary by health
3. **Interest rates may change** – Guaranteed minimums provide floor
4. **Expenses are estimates** – Actual charges vary by company

---

*Last Updated: 2026-01-24*
