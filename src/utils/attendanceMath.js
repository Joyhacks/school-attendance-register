// The one place the attendance percentage is worked out.
//
// held:     classes held for the course
// present, late, excused: marks the student has
//
// Present and late both count as attended. Excused classes are taken
// out of the total, so an excused absence never lowers the score.
// A class with no mark for the student counts as absent.
export function computeAttendance({ held, present, late, excused }) {
  const attended = present + late;
  const counted = held - excused;
  if (counted <= 0) return { attended, counted: Math.max(counted, 0), percent: null };
  const percent = Math.round((attended / counted) * 1000) / 10;
  return { attended, counted, percent };
}

// "ok", "at_risk" or "no_data" for a student in a course.
export function attendanceStanding(percent, minAttendance) {
  if (percent === null) return 'no_data';
  return percent >= minAttendance ? 'ok' : 'at_risk';
}
