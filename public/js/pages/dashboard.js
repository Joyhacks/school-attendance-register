import { api } from '../lib/api.js';
import { $, h, mount, svg } from '../lib/dom.js';
import { formatDate, periodLabel, todayIso } from '../lib/format.js';
import { icon } from '../lib/icons.js';
import { initPage } from '../lib/shell.js';
import { openTakeAttendance } from '../lib/takeAttendance.js';
import { button, buildTable, courseCell, loadInto, person, rateBar, showEmpty } from '../lib/ui.js';

const user = await initPage({ active: 'dashboard' });
const isAdmin = user.role === 'admin';
const today = todayIso();
const MINIMUM = 75;

const hour = new Date().getHours();
const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
const firstName = user.fullName.replace(/^(dr|mr|mrs|ms|prof|engr)\.?\s+/i, '').split(/\s+/)[0];
$('#page-title').textContent = `${greeting}, ${firstName}`;
$('#today').textContent = formatDate(today);

loadInto(
  $('#content'),
  async () => {
    const [summary, { courses }] = await Promise.all([api(`/dashboard?today=${today}`), api('/courses')]);
    return { summary, courses };
  },
  render,
);

function stat(iconName, value, label, alert = false) {
  return h(
    'div',
    { class: alert ? 'stat stat--alert' : 'stat' },
    h('span', { class: 'stat__icon' }, icon(iconName)),
    h('div', {}, h('div', { class: 'stat__value' }, value), h('div', { class: 'stat__label' }, label)),
  );
}

// Weekly attendance as bars, with the 75% line. Built as SVG so it
// stays sharp on a projector and needs no chart library.
function weeklyChart(weeks, availableWidth) {
  // Drawn at the width it is shown, so the labels keep their real size.
  const width = Math.max(300, Math.min(900, Math.round(availableWidth)));
  const height = width < 480 ? 220 : 260;
  const pad = { top: 22, right: 4, bottom: 28, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const slot = plotW / weeks.length;
  const barW = Math.min(44, slot * 0.56);
  const y = (pct) => pad.top + plotH - (pct / 100) * plotH;
  const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const axisDate = width < 480 ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }) : shortDate;

  const grid = [0, 25, 50, 75, 100].map((pct) => [
    svg('line', { class: 'chart__grid', x1: pad.left, x2: width - pad.right, y1: y(pct), y2: y(pct) }),
    svg('text', { class: 'chart__axis', x: pad.left - 8, y: y(pct) + 4, 'text-anchor': 'end' }, `${pct}%`),
  ]);

  const bars = weeks.map((week, i) => {
    const cx = pad.left + slot * i + slot / 2;
    const label = svg('text', { class: 'chart__axis', x: cx, y: height - 8, 'text-anchor': 'middle' }, axisDate.format(new Date(`${week.weekStart}T00:00:00Z`)));
    if (week.rate === null) {
      return [label, svg('text', { class: 'chart__axis', x: cx, y: y(0) - 6, 'text-anchor': 'middle' }, width < 480 ? '0' : 'No class')];
    }
    const top = y(week.rate);
    return [
      svg('rect', {
        class: week.rate < MINIMUM ? 'chart__bar chart__bar--low' : 'chart__bar',
        x: cx - barW / 2,
        y: top,
        width: barW,
        height: y(0) - top,
        rx: 3,
      }),
      svg('text', { class: 'chart__value', x: cx, y: top - 6, 'text-anchor': 'middle' }, `${Math.round(week.rate)}%`),
      label,
    ];
  });

  const described = weeks
    .filter((w) => w.rate !== null)
    .map((w) => `week of ${shortDate.format(new Date(`${w.weekStart}T00:00:00Z`))}: ${w.rate}%`)
    .join(', ');

  return svg(
    'svg',
    { class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Weekly attendance for the last 8 weeks. ${described || 'No classes yet.'}` },
    grid,
    svg('line', { class: 'chart__min', x1: pad.left, x2: width - pad.right, y1: y(MINIMUM), y2: y(MINIMUM) }),
    bars,
  );
}

function render({ summary, courses }) {
  const content = $('#content');
  const actions = $('#page-actions');

  if (courses.length === 0) {
    mount(actions);
    showEmpty(content, isAdmin
      ? {
          iconName: 'courses',
          title: 'Start by adding a course',
          text: 'Add your students and a course, put the students in the course, and the register is ready to mark.',
          action: button('Go to courses', { href: '/courses', icon: 'courses' }),
        }
      : {
          iconName: 'courses',
          title: 'No courses are assigned to you yet',
          text: 'Ask an administrator to assign your courses. They will show up here as soon as that is done.',
        });
    return;
  }

  mount(actions, button('Take attendance', { icon: 'take', onclick: () => openTakeAttendance(courses) }));

  const classesThisWeek = summary.weekly.at(-1)?.classes ?? 0;

  const stats = h(
    'div',
    { class: 'stats' },
    stat('students', summary.students, isAdmin ? 'Students' : 'Students in your courses'),
    stat('courses', summary.courses, isAdmin ? 'Courses' : 'Your courses'),
    stat('percent', summary.attendanceRate === null ? 'No data' : `${summary.attendanceRate}%`, 'Average attendance, last 8 weeks'),
    stat('alert', summary.atRisk, 'Below the minimum attendance', summary.atRisk > 0),
  );

  const chartSlot = h('div', { class: 'chart-slot' });
  const drawChart = () => mount(chartSlot, weeklyChart(summary.weekly, chartSlot.clientWidth || 600));
  const chartPanel = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'chart-title' },
    h('div', { class: 'panel__head' },
      h('h2', { id: 'chart-title' }, 'Weekly attendance'),
      h('span', { class: 'section__sub' }, `${summary.sessionsLast7Days} classes in the last 7 days, ${classesThisWeek} this week`)),
    h('div', { class: 'panel__body' },
      chartSlot,
      h('div', { class: 'legend' },
        h('span', {}, h('i', { class: 'swatch--ok' }), `${MINIMUM}% or more`),
        h('span', {}, h('i', { class: 'swatch--low' }), `Below ${MINIMUM}%`),
        h('span', {}, h('i', { class: 'swatch--min' }), 'Minimum attendance'))),
  );

  const riskPanel = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'risk-title' },
    h('div', { class: 'panel__head' }, h('h2', { id: 'risk-title' }, 'Needs attention'), h('span', { class: 'section__sub' }, 'Lowest attendance first')),
    summary.atRiskStudents.length
      ? h('ul', { class: 'people' }, summary.atRiskStudents.map((s) =>
          h('li', {},
            person(s.fullName, `${s.matricNo}, ${s.courseCode}`, 'risk'),
            h('a', { class: 'people__value', href: `/course?id=${s.courseId}&tab=report&below=1`, 'aria-label': `${s.fullName}: ${s.percent}% in ${s.courseCode}. Open the report.` }, `${s.percent}%`))))
      : h('p', { class: 'panel__empty' }, 'Every student is at or above the minimum attendance.'),
    summary.atRisk > summary.atRiskStudents.length
      ? h('div', { class: 'panel__foot section__sub' }, `${summary.atRisk - summary.atRiskStudents.length} more in the course reports.`)
      : null,
  );

  const courseTable = buildTable({
    caption: 'Courses',
    columns: [
      { label: 'Course', primary: true, cell: (c) => courseCell(c) },
      { label: 'Lecturer', cell: (c) => c.lecturerName || 'Not assigned' },
      { label: 'Students', numeric: true, cell: (c) => c.studentCount },
      { label: 'Classes', numeric: true, cell: (c) => c.sessionCount },
      { label: 'Attendance', cell: (c) => rateBar(c.attendanceRate, c.minAttendance) },
      { label: 'Report', actions: true, cell: (c) => button('Report', { variant: 'quiet', href: `/course?id=${c.id}&tab=report`, ariaLabel: `${c.code} report` }) },
    ],
    rows: courses,
  });

  const recent = summary.recentSessions.length
    ? buildTable({
        caption: 'Recent classes',
        columns: [
          { label: 'Date', primary: true, cell: (s) => h('a', { href: `/register?class=${s.id}` }, formatDate(s.date)) },
          { label: 'Course', cell: (s) => h('span', { class: 'code-chip' }, s.courseCode) },
          { label: 'Class', cell: (s) => periodLabel(s.period) },
          { label: 'Topic', cell: (s) => s.topic || 'No topic' },
          { label: 'Attended', numeric: true, cell: (s) => (s.marked ? `${s.attended} of ${s.enrolled}` : 'Not marked') },
        ],
        rows: summary.recentSessions,
      })
    : h('p', { class: 'panel__empty' }, 'The classes you take attendance for will be listed here.');

  mount(
    content,
    stats,
    h('div', { class: 'dash-grid' }, chartPanel, riskPanel),
    h('section', { class: 'section panel', 'aria-labelledby': 'courses-title' },
      h('div', { class: 'panel__head' }, h('h2', { id: 'courses-title' }, isAdmin ? 'Courses' : 'Your courses'), h('a', { href: '/courses', class: 'section__sub' }, 'All courses')),
      courseTable),
    h('section', { class: 'section panel', 'aria-labelledby': 'recent-title' },
      h('div', { class: 'panel__head' }, h('h2', { id: 'recent-title' }, 'Recent classes')),
      recent),
  );

  drawChart();
  let lastWidth = chartSlot.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs(chartSlot.clientWidth - lastWidth) < 8) return;
    lastWidth = chartSlot.clientWidth;
    drawChart();
  }).observe(chartSlot);
}
