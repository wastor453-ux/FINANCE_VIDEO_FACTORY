import test from "node:test";
import assert from "node:assert/strict";
import { numbersIn } from "../lib/numwords.mjs";

test("numbersIn reads digits and number words", () => {
  const n = (t) => [...numbersIn(t)].sort((a, b) => a - b);
  assert.deepEqual(n("57% communicating and only 43% creating"), [43, 57]);
  assert.deepEqual(n("Premium $30 / month"), [30]);
  assert.deepEqual(n("Sixty-four percent of employees"), [64]);
  assert.deepEqual(n("twenty eight percent, thirteen hours"), [13, 28]);
  assert.deepEqual(n("3.5x more likely"), [3.5]);
  assert.deepEqual(n("one hundred and five"), [105]);
  assert.deepEqual(n("Reading e-mail 28. Searching 19. Internal 14. Role-specific tasks 39."), [14, 19, 28, 39]);
  assert.deepEqual(n("no numbers here at all"), []);
});
