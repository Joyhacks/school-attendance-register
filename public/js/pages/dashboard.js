import { api } from '../lib/api.js';
import { $, h, mount } from '../lib/dom.js';
import { formatDate, periodLabel, todayIso } from '../lib/format.js';
import { initPage } from '../lib/shell.js';
import { openTakeAttendance } from '../lib/takeAttendance.js';
import { buildTable, loadInto, showEmpty } from '../lib/ui.js';

const user = await initPage({ active: 'dashboard' });
const isAdmin = user.role === 'admin';
const today = todayIso();

$('#today').textContent = formatDate(today);

loadInto(
  $('#content'),
  async () => {
    const [summary, { courses }] = await Promise.all([api(`/dashboard?today=${today}`), api('/courses')]);
    return { summary, courses };
  },
  render,
);

function figure(value, label, alert = false) {
  return h('div', { class: alert ? 'figure figure--alert' : 'figure' }, h('div', { class: 'figure__value' }, value), h('div', { class: 'figure__label' }, label));
}

function render({ summary, courses }) {
  const content = $('#content');
  const actions = $('#page-actions');

  if (courses.length === 0) {
    mount(actions);
    showEmpty(content, isAdmin
      ? {
          title: 'Start by adding a course',
          text: 'Add your students and a course, put the students in the course, and the register is ready to mark.',
          action: h('a', { class: 'btn btn--primary', href: '/courses' }, 'Go to courses'),
        }
      : {
          title: 'No courses are assigned to you yet',
          text: 'Ask an admin to assign your courses. They will show up here as soon as that is done.',
        });
    return;
  }

  mount(actions, h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openTakeAttendance(courses) }, 'Take attendance'));

  const figures = h(
    'div',
    { class: 'figures' },
    figure(summary.students, isAdmin ? 'Students' : 'Students in your courses'),
    figure(summary.courses, isAdmin ? 'Courses' : 'Your courses'),
    figure(summary.sessionsLast7Days, 'Classes in the last 7 days'),
    figure(summary.atRisk, 'Below the minimum attendance', summary.atRisk > 0),
  );

  const courseTable = buildTable({
    caption: 'Courses',
    columns: [
      { label: 'Course', primary: true, cell: (c) => h('a', { href: `/course?id=${c.id}` }, `${c.code} ${c.title}`) },
      { label: 'Students', numeric: true, cell: (c) => c.studentCount },
      { label: 'Classes held', numeric: true, cell: (c) => c.sessionCount },
      { label: 'Last class', cell: (c) => (c.lastSessionDate ? formatDate(c.lastSessionDate) : 'None yet') },
      { label: 'Report', actions: true, cell: (c) => h('a', { class: 'btn btn--quiet', href: `/course?id=${c.id}&tab=report` }, 'View report') },
    ],
    rows: courses,
  });

  const recent = summary.recentSessions.length
    ? buildTable({
        caption: 'Recent classes',
        columns: [
          { label: 'Date', primary: true, cell: (s) => h('a', { href: `/register?class=${s.id}` }, formatDate(s.date)) },
          { label: 'Course', cell: (s) => s.courseCode },
          { label: 'Class', cell: (s) => periodLabel(s.period) },
          { label: 'Topic', cell: (s) => s.topic || 'No topic' },
          { label: 'Attended', numeric: true, cell: (s) => (s.marked ? `${s.attended} of ${s.enrolled}` : 'Not marked') },
        ],
        rows: summary.recentSessions,
      })
    : h('div', { class: 'state' }, h('h2', {}, 'No classes yet'), h('p', {}, 'The classes you take attendance for will be listed here.'));

  mount(
    content,
    figures,
    h('section', { class: 'section' }, h('div', { class: 'section__head' }, h('h2', {}, isAdmin ? 'Courses' : 'Your courses')), courseTable),
    h('section', { class: 'section' }, h('div', { class: 'section__head' }, h('h2', {}, 'Recent classes')), recent),
  );
}
