// Gate fixtures on three different finance topics. They test the CHECKER on varied material
// (they are short, synthetic, and not production scripts). The real writing-quality test is a Muse run per topic.
const SRC = [{ id: "ex", title: "Worked example computed in code", url: "https://example.org/worked-example", accessed: "2026-11-01" }];
const ill = (id, text) => ({ id, text, sourceIds: ["ex"], sourceKind: "illustrative", dataYear: 2026 });
function build({ title, hookType, rehook, scenes, promises }) {
  let n = 0;
  return {
    schema_version: "1.0", title, language: "en-US", targetSeconds: 300, originalityNote: "Synthetic gate fixture, written fresh for this topic.",
    sources: SRC, hookType, rehookBeat: rehook, disclaimerIncluded: true, ...(promises ? { promises } : {}),
    scenes: scenes.map((s, i) => {
      const beats = s.beats.map(([text, visualIntent, extra = {}]) => ({ id: `B${String(++n).padStart(2, "0")}`, narration: text, visualIntent, ...extra }));
      return { id: `S${String(i + 1).padStart(2, "0")}`, beat: s.name, narration: beats.map((b) => b.narration).join(" "), claims: s.claims || [], beats };
    }),
  };
}

export const creditCard = build({
  title: "Why a Credit Card Balance Grows Faster Than You Think", hookType: "curiosity_gap", rehook: "B08",
  scenes: [
    { name: "Hook", claims: [ill("C1", "Example: 2,000 dollars at 24 percent a year is about 480 dollars of interest in year one")], beats: [
      ["Two thousand dollars on a card at twenty four percent costs you about four hundred and eighty dollars in the first year.", "hero_number"],
      ["Pay nothing extra, and next year the interest is charged on the interest too. Here's how fast that snowballs.", "hook_question"]] },
    { name: "How it grows", claims: [ill("C2", "Example: 2,000 dollars at 2 percent a month for 12 months grows to about 2,536 dollars")], beats: [
      ["Card interest is charged monthly. At two percent a month, two thousand dollars becomes about two thousand five hundred and thirty six dollars after a year. That is what happens if you never pay it down.", "compound_growth"],
      ["That's more than the simple math says. Each month's interest joins the balance, and next month's charge lands on the bigger number. Ouch.", "line_chart", { data: { claimId: "C2" } }],
      ["Why does the gap widen so quickly?", "causal_diagram"]] },
    { name: "Minimum payments", claims: [ill("C3", "Example: a 3 percent minimum on 2,000 dollars is 60 dollars in month one")], beats: [
      ["The minimum payment feels safe. On a two thousand dollar balance, three percent is sixty dollars this month.", "kpi_card"],
      ["Forty of that sixty goes to interest. Only twenty chips away at what you owe, so the balance barely moves.", "stacked_breakdown", { data: { claimId: "C3" } }],
      ["And as the balance shrinks, so does the minimum. That keeps the payoff date far away.", "debt_payoff", { data: { claimId: "C3" } }]] },
    { name: "Midpoint re-hook", beats: [
      ["So what changes the picture most? A big windfall would, but most of us never get one.", "hook_question", { interrupt: true }],
      ["A small, steady extra payment does nearly as much, and the next section shows why.", "annotation_callout"],
      ["Keep an eye on the gap between the two lines.", "annotation_callout"]] },
    { name: "Extra payment", claims: [ill("C4", "Example: adding 50 dollars a month to a 2,000 dollar balance at 24 percent cuts the payoff time by about two years")], beats: [
      ["Add fifty dollars a month on top of the minimum. On the same two thousand dollar balance, that cuts the payoff time by roughly two years.", "scenario_comparison"],
      ["Same card. Same rate. One different habit, and the interest you skip becomes the real prize at the end of the whole story.", "compare_ab"],
      ["Notice where the lines split. That's the month the extra payment starts doing the heavy lifting.", "annotation_callout"]] },
    { name: "Close", claims: [], beats: [
      ["So pick a number you can repeat every month, even a small one, and set it to pay automatically.", "action_checklist"],
      ["That's the whole plan. This video is for education, and it's not financial advice. Check your own card's terms before you decide.", "closing_composition"]] },
  ] });

export const rentVsBuy = build({
  title: "Rent or Buy: Where the Break-Even Really Sits", hookType: "specific_promise", rehook: "B09",
  promises: [{ text: "find your own break-even point in ten minutes", paidOffIn: ["S04", "S05"] }],
  scenes: [
    { name: "Hook", claims: [ill("C1", "Example: renting at 2,000 dollars a month versus owning at 2,600 dollars a month")], beats: [
      ["Rent at two thousand a month, or own at twenty six hundred? One break-even point settles it, and you can find yours in ten minutes.", "hook_question"],
      ["No rule of thumb. Just one comparison, run on your own numbers, with a clear answer at the end.", "process_flow"]] },
    { name: "What each costs", claims: [ill("C2", "Example: owner costs of 2,600 dollars include 900 dollars of principal paid back to the owner")], beats: [
      ["Start with the monthly bill. Owning costs twenty six hundred dollars here, and renting costs two thousand.", "bar_chart"],
      ["But nine hundred of that owner payment pays down the loan, so it comes back to you later. Rent never does.", "stacked_breakdown"],
      ["Which number matters more? It depends on how long you stay.", "hook_question"]] },
    { name: "Hidden costs", claims: [ill("C3", "Example: maintenance of 1 percent of a 400,000 dollar home is 4,000 dollars a year")], beats: [
      ["Owners also pay for repairs. One percent of a four hundred thousand dollar home is four thousand dollars a year.", "hero_number"],
      ["Renters skip that bill, and they can leave when the lease ends. That freedom has a price too, and it shows up as rent increases you don't control.", "risks_grid"],
      ["Add it all up month by month and the picture shifts.", "cashflow_waterfall", { data: { claimId: "C3" } }]] },
    { name: "The break-even year", claims: [ill("C4", "Example: in this scenario owning pulls ahead after about year 6")], beats: [
      ["Plot both paths over time. In this example, the owner's wealth catches up to the renter's around year six, and after that the gap only widens in the owner's favor.", "line_chart", { data: { claimId: "C4" } }],
      ["Before year six, renting wins. After it, owning wins. Simple. So where's your move date on that line, and what does it tell you?", "timeline"],
      ["That crossing point is the whole decision in one picture.", "annotation_callout"]] },
    { name: "Midpoint re-hook", beats: [
      ["So is year six the answer for everyone? No, and the reason is one input people skip.", "hook_question", { interrupt: true }],
      ["Watch what happens when we change just the home price growth.", "annotation_callout"],
      ["The line moves a lot more than you'd expect.", "annotation_callout"]] },
    { name: "Close", beats: [
      ["Run your own numbers with your own rent, price and move date. If you'll leave before the crossing, renting is the cheaper path.", "action_checklist"],
      ["This video is for education, and it's not financial advice. Rates and prices vary, so check your local market.", "closing_composition"]] },
  ] });

export const paycheckFlow = build({
  title: "Where One Paycheck Actually Goes", hookType: "empathy_mirror", rehook: "B08",
  promises: [{ text: "follow one paycheck dollar by dollar and find the leaks", paidOffIn: ["S02", "S03", "S05"] }],
  scenes: [
    { name: "Hook", claims: [ill("C1", "Example: a 3,000 dollar paycheck split into 5 buckets")], beats: [
      ["You get paid three thousand dollars, and a week later you can't say where it went.", "hero_number"],
      ["Let's follow that one paycheck, dollar by dollar, and see where the leaks are.", "process_flow"]] },
    { name: "The fixed bills", claims: [ill("C2", "Example: 1,500 dollars of fixed bills is half of a 3,000 dollar paycheck")], beats: [
      ["First stop is the fixed bills. Rent, utilities and insurance take fifteen hundred dollars. That's half the paycheck gone before lunch.", "donut_allocation"],
      ["These bills don't move. They set the floor for everything else, and nothing you do later can lower it this month.", "kpi_card"],
      ["What's left is where your choices live.", "hook_question"]] },
    { name: "The flexible spending", claims: [ill("C3", "Example: 900 dollars flexible spending in a 3,000 dollar paycheck")], beats: [
      ["Next come groceries, gas and fun. In this example that's nine hundred dollars a month, and every cent of it is a choice.", "stacked_breakdown"],
      ["Small purchases hide here. Fifteen dollars a day feels like nothing, yet it's four hundred and fifty dollars a month.", "bar_chart"],
      ["Spot the biggest bar. That's your first lever, and a few small cuts there beat one big sacrifice somewhere else.", "annotation_callout"]] },
    { name: "Midpoint re-hook", beats: [
      ["Now the surprising part: the smallest bucket does the most work for your future.", "hook_question", { interrupt: true }],
      ["It's only six hundred dollars, and it's the one most people fill last.", "hero_number"],
      ["Here's what happens when it moves first instead.", "process_flow"]] },
    { name: "Pay yourself first", claims: [ill("C4", "Example: 600 dollars saved is 20 percent of a 3,000 dollar paycheck")], beats: [
      ["Move six hundred dollars, twenty percent, to savings the day you get paid. The rest of the plan adjusts around it.", "cashflow_waterfall"],
      ["Same paycheck. Same bills. Different order. The order is the whole trick, and it costs you nothing to try on your next payday.", "compare_ab"],
      ["Follow the arrow from payday to savings and notice nothing else had to change.", "causal_diagram"]] },
    { name: "Close", beats: [
      ["Try it on your next paycheck: bills, then savings, then everything else.", "action_checklist"],
      ["This video is for education, and it's not financial advice. Your numbers will differ, so adjust the buckets to your life.", "closing_composition"]] },
  ] });
