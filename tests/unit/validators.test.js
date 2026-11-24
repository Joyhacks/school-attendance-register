import assert from 'node:assert/strict';
import { test } from 'node:test';
import { likeTerm, parseId, rules, validate } from '../../src/utils/validators.js';

test('text is trimmed and inner spaces are collapsed', () => {
  assert.deepEqual(rules.text()('  Ada   Obi '), { value: 'Ada Obi' });
});

test('text rejects empty, too long and non-text values', () => {
  assert.ok(rules.text()('   ').error);
  assert.ok(rules.text({ max: 3 })('abcd').error);
  assert.ok(rules.text()({ evil: true }).error);
  assert.ok(rules.text()(undefined).error);
});

test('email is lowercased and checked', () => {
  assert.deepEqual(rules.email()(' Ada@School.EDU '), { value: 'ada@school.edu' });
  assert.ok(rules.email()('not-an-email').error);
});

test('password needs 8 to 72 characters', () => {
  assert.ok(rules.password()('short').error);
  assert.ok(rules.password()('x'.repeat(73)).error);
  assert.deepEqual(rules.password()('long enough'), { value: 'long enough' });
});

test('date accepts real dates only', () => {
  assert.deepEqual(rules.date()('2026-11-24'), { value: '2026-11-24' });
  assert.ok(rules.date()('2026-02-31').error);
  assert.ok(rules.date()('24/11/2026').error);
});

test('integer accepts numbers and numeric text within range', () => {
  assert.deepEqual(rules.integer({ min: 0, max: 100 })('75'), { value: 75 });
  assert.ok(rules.integer({ min: 0, max: 100 })(101).error);
  assert.ok(rules.integer()(1.5).error);
  assert.ok(rules.integer()('abc').error);
});

test('validate drops fields that are not in the schema', () => {
  const clean = validate({ fullName: 'Ada Obi', role: 'admin', isAdmin: true }, { fullName: rules.text() });
  assert.deepEqual(clean, { fullName: 'Ada Obi' });
});

test('validate reports every bad field at once', () => {
  assert.throws(
    () => validate({}, { fullName: rules.text({ label: 'Full name' }), email: rules.email() }),
    (err) => err.status === 422 && Boolean(err.fields.fullName) && Boolean(err.fields.email),
  );
});

test('partial validation skips fields that were not sent', () => {
  assert.deepEqual(validate({ email: 'a@b.co' }, { fullName: rules.text(), email: rules.email() }, { partial: true }), { email: 'a@b.co' });
});

test('parseId turns bad ids into a 404', () => {
  assert.equal(parseId('12'), 12);
  for (const bad of ['0', '-1', 'abc', '1.5', '1 OR 1=1']) {
    assert.throws(() => parseId(bad), (err) => err.status === 404);
  }
});

test('likeTerm escapes wildcard characters', () => {
  assert.equal(likeTerm('100%_a'), '%100\\%\\_a%');
});
