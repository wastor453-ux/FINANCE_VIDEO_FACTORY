---
name: ffx-fact-check
description: Verify every factual claim and number in the script against primary sources and fix or remove what fails. Use after ffx-script and again after any script edit.
---

# Fact check

1. For each claim, open the cited source (web search/fetch) and confirm the exact figure, date, unit and scope. Record `verified: true` only after you saw it.
2. Prefer primary sources: BLS, BEA, FRED/St. Louis Fed, Federal Reserve, SEC filings, IRS, company reports, peer-reviewed research.
3. Distinguish historical data, estimates, forecasts and hypothetical examples; never present one as another. Hypotheticals get `illustrative` labels in the scene plan.
4. Recompute every calculation (compound growth, percentages) in code and store the formula and inputs.
5. Unverifiable claim: rewrite as an attributed statement or delete it. Never keep a number you could not verify.
6. Output a short report: verified, corrected, removed, still uncertain (needs human).
