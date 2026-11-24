import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceStanding, computeAttendance } from '../../src/utils/attendanceMath.js';

test('present and late both count as attended', () => {
  const result = computeAttendance({ held: 10, present: 6, late: 2, excused: 0 });
  assert.deepEqual(result, { attended: 8, counted: 10, percent: 80 });
});

test('excused classes are left out of the total', () => {
  const result = computeAttendance({ held: 10, present: 6, late: 0, excused: 2 });
  assert.equal(result.counted, 8);
  assert.equal(result.percent, 75);
});

test('a class with no mark counts as absent', () => {
  // 4 held, only 1 mark recorded (present). The other 3 count against the student.
  assert.equal(computeAttendance({ held: 4, present: 1, late: 0, excused: 0 }).percent, 25);
});

test('percent is rounded to one decimal place', () => {
  assert.equal(computeAttendance({ held: 6, present: 4, late: 0, excused: 0 }).percent, 66.7);
});

test('no classes, or every class excused, gives no percentage', () => {
  assert.equal(computeAttendance({ held: 0, present: 0, late: 0, excused: 0 }).percent, null);
  assert.equal(computeAttendance({ held: 3, present: 0, late: 0, excused: 3 }).percent, null);
});

test('standing compares against the course minimum', () => {
  assert.equal(attendanceStanding(75, 75), 'ok');
  assert.equal(attendanceStanding(74.9, 75), 'at_risk');
  assert.equal(attendanceStanding(null, 75), 'no_data');
});
