# Money Returns on Real Estate Projects

This document describes the investment return structure for real estate projects, including capital returns, preferred returns, and how different income sources are distributed among investors.

## Overview

Real estate investments involve two primary investor types:

- **GP (General Partner)**: Active manager/sponsor who operates the project
- **LP (Limited Partner)**: Passive investor who provides capital

Returns are structured to provide investors with both their capital back and a share of profits, with specific priority rules for different income types.

## Return Types

### Capital Return

Capital return refers to money distributed to investors against their original invested capital. This excludes bank financing—only equity contributions from individuals (GP and LP) are considered.

**Key characteristics:**
- Returns principal invested by GP/LP
- Does not include bank loan repayments (those are handled separately)
- Priority: Preferred return is paid first, then principal

### Preferred Return

Preferred return is an interest-like return that accrues on outstanding invested capital. It compensates investors for the time value of their money while capital remains at risk.

**Key characteristics:**
- Accrues on the outstanding capital balance
- Rate is configurable per project (e.g., 8% annually)
- **Stops accumulating** once the investor's capital is fully returned
- **Reduces proportionally** as capital is returned (if 50% of capital is returned, preferred return only accrues on the remaining 50%)

**Example:**
- Investor contributes $100,000
- Preferred return rate: 8% annually
- After Year 1: $8,000 preferred return accrued
- Investor receives $50,000 capital return
- Year 2 preferred return accrues on remaining $50,000 = $4,000

## GP/LP Holdings Calculation

### LP Holdings Formula

LP holding percentage is calculated as:

```
LP Holding % = (LP Investment / Total Project Cost) × 50%
```

**Example:**
- Total project cost: $10,000,000
- LP invests: $1,000,000
- LP Holding: ($1,000,000 / $10,000,000) × 50% = **5%**

### GP Promote Structure

GP receives promoted ownership regardless of their capital contribution relative to the project cost. This "promote" compensates the GP for:
- Sourcing and structuring the deal
- Managing construction and operations
- Taking on additional risk and liability

**Example:**
- Total project cost: $10,000,000
- GP invests: $500,000 (5% of project cost)
- GP Holding: **50%** (despite only investing 5% of capital)

This 50/50 split after LP's proportional calculation is a common structure, though the exact promote percentage can vary by deal.

## Income Sources and Distribution

Real estate projects generate returns through three primary income sources, each with different distribution rules:

| Income Source | Distribution Type | Priority |
|---------------|-------------------|----------|
| Refinance | Capital Return | Preferred first, then principal |
| Sale | Capital Return | Preferred first, then principal |
| NOI (Leases) | Configurable | Option A: Capital Return OR Option B: Holding % |

### Refinance Proceeds

When a property is refinanced, the cash-out proceeds are **always treated as capital return** and distributed based on **capital contribution percentage** (not holding percentage):

**Distribution Formula:**
```
Investor's Refi Share = (Investor's Capital / Total Equity Capital) × Refi Amount
```

**Key Points:**
- GP and LP are treated equally based on capital contributed
- Holding percentage does NOT affect refinance distribution
- This ensures capital is returned proportionally to how much each person invested

**Example:**
- Total equity: $3,000,000
- GP contributed: $1,000,000 (33.3% of capital)
- LP contributed: $2,000,000 (66.7% of capital)
- Refi amount: $900,000
- GP receives: $900,000 × 33.3% = $300,000
- LP receives: $900,000 × 66.7% = $600,000

**After preferred return is satisfied:**
1. Pay accrued preferred return first (pro-rata by capital)
2. Return principal to investors (pro-rata by capital)
3. Any excess after full capital return → profit distribution by holding %

### Sale Proceeds

When a property is sold, proceeds (after paying off debt) are **always treated as capital return** and distributed based on **capital contribution percentage** (same as refinance):

**Distribution Formula:**
```
Investor's Sale Share = (Investor's Capital / Total Equity Capital) × Net Sale Proceeds
```

1. Pay accrued preferred return first (pro-rata by capital)
2. Return remaining principal to investors (pro-rata by capital)
3. Any excess after full capital return → profit distribution by holding %

### NOI (Net Operating Income from Leases)

NOI distribution is **configurable** based on project structure:

#### Option A: Capital Return Mode

NOI is treated like refinance/sale proceeds:
1. Pay accrued preferred return first
2. Apply remainder to principal reduction
3. After capital fully returned → distribute by holding %

This mode prioritizes returning investor capital quickly.

#### Option B: Distribution Mode

NOI is distributed directly by holding percentage, regardless of whether capital has been fully returned:
- Each investor receives NOI × their holding %
- Preferred return continues to accrue separately on outstanding capital
- Capital is returned through refinance or sale events

This mode provides regular cash flow to all investors proportional to ownership.

## Distribution Waterfall

The complete distribution priority (waterfall) for capital return events:

```
1. Accrued Preferred Return (to all investors pro-rata)
   ↓
2. Return of Capital (to all investors pro-rata)
   ↓
3. Profit Split (by holding percentage)
   - GP receives their holding % (e.g., 50%)
   - LP receives their holding % (e.g., 5% each)
```

## Worked Example

### Project Setup

| Item | Value |
|------|-------|
| Total Project Cost | $10,000,000 |
| Bank Loan | $7,000,000 |
| Equity Required | $3,000,000 |
| Preferred Return Rate | 8% annually |

### Investor Contributions

| Investor | Capital | Holding % | Calculation |
|----------|---------|-----------|-------------|
| GP | $1,000,000 | 50% | Promote structure |
| LP1 | $1,000,000 | 5% | ($1M / $10M) × 50% |
| LP2 | $1,000,000 | 5% | ($1M / $10M) × 50% |
| **Total** | **$3,000,000** | **60%** | |

*Note: Holdings total 60% as this example shows partial LP participation. In practice, holdings would typically total 100%.*

### Year 1: Preferred Return Accrual

| Investor | Capital Outstanding | Preferred (8%) |
|----------|---------------------|----------------|
| GP | $1,000,000 | $80,000 |
| LP1 | $1,000,000 | $80,000 |
| LP2 | $1,000,000 | $80,000 |
| **Total** | **$3,000,000** | **$240,000** |

### Year 2: Refinance Event ($1,500,000 cash out)

**Step 1: Pay Preferred Return**
- Total preferred accrued: $240,000 (Year 1) + $240,000 (Year 2) = $480,000
- Distributed pro-rata based on capital:
  - GP: $160,000
  - LP1: $160,000
  - LP2: $160,000

**Step 2: Return Capital**
- Remaining after preferred: $1,500,000 - $480,000 = $1,020,000
- Distributed pro-rata:
  - GP: $340,000 (capital remaining: $660,000)
  - LP1: $340,000 (capital remaining: $660,000)
  - LP2: $340,000 (capital remaining: $660,000)

### Year 3-5: NOI Distribution ($200,000/year)

**If Capital Return Mode:**
- First pay any accrued preferred on remaining $1,980,000
- Then reduce principal further

**If Distribution Mode:**
- GP receives: $200,000 × 50% = $100,000/year
- LP1 receives: $200,000 × 5% = $10,000/year
- LP2 receives: $200,000 × 5% = $10,000/year
- Remaining 40% retained or distributed to other investors

### Year 5: Sale Event ($15,000,000)

**Step 1: Pay Off Loan**
- Remaining loan balance: ~$6,500,000
- Net proceeds: $8,500,000

**Step 2: Pay Preferred Return**
- Pay any accrued preferred on remaining capital

**Step 3: Return Remaining Capital**
- Return outstanding principal to all investors

**Step 4: Profit Distribution**
- Excess proceeds distributed by holding %
- GP (50%): Largest share due to promote
- LP1 (5%): Proportional to investment
- LP2 (5%): Proportional to investment

## Summary

| Concept | Description |
|---------|-------------|
| Capital Return | Return of invested principal (GP/LP only, not bank) |
| Preferred Return | Interest on outstanding capital; stops when capital returned |
| GP Promote | GP receives outsized ownership relative to capital invested |
| LP Formula | Holding % = (Investment / Project Cost) × 50% |
| Refinance/Sale | Always capital return, split by **capital contribution %** (not holding %) |
| NOI | Configurable: capital return OR holding % distribution |
| Profit Split | After capital returned, distributed by holding % |

