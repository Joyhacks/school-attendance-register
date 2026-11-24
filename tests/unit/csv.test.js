import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCsv } from '../../src/utils/csv.js';

test('quotes cells that contain commas, quotes or new lines', () => {
  const csv = toCsv(['Name'], [['Obi, Ada'], ['He said "hi"']]);
  assert.ok(csv.includes('"Obi, Ada"'));
  assert.ok(csv.includes('"He said ""hi"""'));
});

test('neutralises cells that a spreadsheet would run as a formula', () => {
  const csv = toCsv(['Name'], [['=HYPERLINK("http://x")'], ['+1'], ['@cmd']]);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`));
  assert.ok(csv.includes("'+1"));
  assert.ok(csv.includes("'@cmd"));
});

test('starts with a UTF-8 marker so Excel reads names correctly', () => {
  assert.equal(toCsv(['A'], []).charCodeAt(0), 0xfeff);
});
