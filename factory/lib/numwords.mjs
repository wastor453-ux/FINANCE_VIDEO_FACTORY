// English number words -> integers, for checking that chart numbers appear in a verified claim ("Sixty-four percent" -> 64).
const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** All numbers a text states, as a Set of numbers: digits ("57%", "$30", "3.5x", "1,200") and number words ("Sixty-four", "twenty eight", "one hundred and five"). */
export function numbersIn(text) {
  const out = new Set();
  for (const m of text.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(\.\d+)?/g) || []) out.add(Number(m));
  const toks = text.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean);
  let cur = null, run = false;
  const flush = () => { if (run && cur !== null) out.add(cur); cur = null; run = false; };
  for (const t of toks) {
    if (t in UNITS) { cur = (cur ?? 0) + UNITS[t]; run = true; if (UNITS[t] >= 10 || cur % 100 === 0) { /* keep */ } }
    else if (t in TENS) { cur = (cur ?? 0) + TENS[t]; run = true; }
    else if (t === "hundred" && run) cur = (cur === null ? 1 : cur) * 100;
    else if (t === "and" && run) continue;
    else flush();
  }
  flush();
  return out;
}
