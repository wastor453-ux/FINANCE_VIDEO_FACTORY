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
6. **Freshness**: for every statistic record `dataYear`. If it is two or more years old, search for a newer edition and use it; if there is none, say the year in the narration. Check every "latest", "current" or "new" in the narration against the newest edition you can find.
7. **Source quality**: if a figure came from a summary or blog post, find the primary report; if you cannot, mark `sourceKind: "secondary"` and attribute it ("as reported by").
8. **No creator claims**: a figure that only the researched creator stated is re-verified at a primary source or cut. Never name or cite them; no `attributed` claims.
9b. **Scope check**: for every claim, put the source's exact line beside the narration. If the narration says more than the source (for example "reads reviews before they choose" when the source says "never read reviews"), rewrite the narration.
9. **Promise check**: confirm each entry in `script.promises` is paid off by the scenes it lists.
10. Output a short report: verified, corrected, removed, still uncertain (needs human).
10. **Exact quotes.** `sourceQuote` is the source's line copied exactly. Do not add or remove symbols to make a number match: the gate ignores `$` and thousands commas when it checks that the claim's numbers appear in the quote.
