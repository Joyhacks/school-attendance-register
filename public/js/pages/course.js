import { api } from '../lib/api.js';
import { openCourseForm } from '../lib/courseForm.js';
import { $, h, mount } from '../lib/dom.js';
import { formatDate, formatPercent, periodLabel, plural } from '../lib/format.js';
import { getParam, initPage, setParams } from '../lib/shell.js';
import { openTakeAttendance } from '../lib/takeAttendance.js';
import { buildField, buildTable, confirmDialog, formDialog, loadInto, showEmpty, showError, toast } from '../lib/ui.js';

const TABS = [
  { key: 'classes', label: 'Classes' },
  { key: 'students', label: 'Students' },
  { key: 'report', label: 'Report' },
];

const user = await initPage({ active: 'courses' });
const isAdmin = user.role === 'admin';
const courseId = Number(getParam('id'));
const panel = $('#tab-panel');
let course = null;

async function loadCourse() {
  try {
    ({ course } = await api(`/courses/${courseId}`));
  } catch (error) {
    $('#course-title').textContent = 'Course';
    showError(panel, error);
    return;
  }
  renderHeader();
  renderTabs();
  showTab(currentTab());
}

function currentTab() {
  const tab = getParam('tab');
  return TABS.some((t) => t.key === tab) ? tab : 'classes';
}

function renderHeader() {
  document.title = `${course.code} | Attendance Register`;
  $('#course-title').textContent = `${course.code} ${course.title}`;
  $('#course-meta').textContent =
    `${course.lecturerName ? `Lecturer: ${course.lecturerName}` : 'No lecturer assigned'}. Minimum attendance ${course.minAttendance}%.`;
  mount(
    $('#page-actions'),
    h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openTakeAttendance([], course.id) }, 'Take attendance'),
    isAdmin ? h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => openCourseForm(course, loadCourse) }, 'Edit course') : null,
  );
}

function renderTabs() {
  const active = currentTab();
  mount(
    $('#tabs'),
    TABS.map((tab) =>
      h(
        'a',
        {
          href: `/course?id=${course.id}&tab=${tab.key}`,
          'aria-current': tab.key === active ? 'page' : null,
          onclick: (event) => {
            // Plain click switches in place. Ctrl or Cmd click still opens a new tab.
            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            setParams({ tab: tab.key, below: '' }, { replace: false });
            renderTabs();
            showTab(tab.key);
          },
        },
        tab.key === 'students' ? `Students (${course.studentCount})` : tab.label,
      ),
    ),
  );
}

function showTab(tab) {
  if (tab === 'students') return loadStudents();
  if (tab === 'report') return loadReport();
  return loadClasses();
}

window.addEventListener('popstate', () => {
  renderTabs();
  showTab(currentTab());
});

// ---------- Classes ----------

function loadClasses() {
  return loadInto(panel, () => api(`/courses/${course.id}/sessions`), ({ sessions }) => {
    if (sessions.length === 0) {
      showEmpty(panel, {
        title: 'No classes yet',
        text: 'Take attendance for the first class and it will be listed here.',
        action: h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openTakeAttendance([], course.id) }, 'Take attendance'),
      });
      return;
    }
    mount(
      panel,
      buildTable({
        caption: `Classes held for ${course.code}`,
        columns: [
          { label: 'Date', primary: true, cell: (s) => h('a', { href: `/register?class=${s.id}` }, formatDate(s.date)) },
          { label: 'Class', cell: (s) => periodLabel(s.period) },
          { label: 'Topic', cell: (s) => s.topic || 'No topic' },
          { label: 'Present', numeric: true, cell: (s) => s.present },
          { label: 'Late', numeric: true, cell: (s) => s.late },
          { label: 'Absent', numeric: true, cell: (s) => s.absent },
          { label: 'Excused', numeric: true, cell: (s) => s.excused },
          {
            label: 'Actions',
            actions: true,
            cell: (s) =>
              h('button', { class: 'btn btn--quiet btn--danger-text', type: 'button', 'aria-label': `Delete class of ${formatDate(s.date)}`, onclick: () => deleteClass(s) }, 'Delete'),
          },
        ],
        rows: sessions,
      }),
    );
  });
}

async function deleteClass(session) {
  const confirmed = await confirmDialog({
    title: 'Delete this class?',
    text: `The class of ${formatDate(session.date)} and every mark in it will be removed. This cannot be undone.`,
    confirmLabel: 'Delete class',
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api(`/sessions/${session.id}`, { method: 'DELETE' });
    toast('Class deleted.');
    await loadCourse();
  } catch (error) {
    toast(error.message, { error: true });
  }
}

// ---------- Students ----------

function studentActions() {
  return h(
    'div',
    { class: 'section__head' },
    h('h2', {}, 'Students in this course'),
    h(
      'div',
      { class: 'page-head__actions' },
      h('button', { class: 'btn btn--secondary', type: 'button', onclick: openAddGroup }, 'Add a whole class'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: openAddStudents }, 'Add students'),
    ),
  );
}

function loadStudents() {
  return loadInto(panel, () => api(`/courses/${course.id}/students`), ({ students }) => {
    if (students.length === 0) {
      mount(panel, studentActions());
      const empty = h('div');
      panel.append(empty);
      showEmpty(empty, {
        title: 'Nobody is in this course yet',
        text: 'Add students one by one, or add a whole class at once by department and level.',
      });
      return;
    }
    mount(
      panel,
      studentActions(),
      buildTable({
        caption: `Students in ${course.code}`,
        columns: [
          { label: 'Name', primary: true, cell: (s) => s.fullName },
          { label: 'Matric number', cell: (s) => h('span', { class: 'num' }, s.matricNo) },
          { label: 'Department', cell: (s) => s.department },
          { label: 'Level', cell: (s) => s.level },
          {
            label: 'Actions',
            actions: true,
            cell: (s) =>
              h('button', { class: 'btn btn--quiet btn--danger-text', type: 'button', 'aria-label': `Remove ${s.fullName}`, onclick: () => removeStudent(s) }, 'Remove'),
          },
        ],
        rows: students,
      }),
    );
  });
}

async function removeStudent(student) {
  const confirmed = await confirmDialog({
    title: `Remove ${student.fullName}?`,
    text: `They will be taken off ${course.code} and their attendance marks in this course will be deleted.`,
    confirmLabel: 'Remove from course',
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api(`/courses/${course.id}/students/${student.id}`, { method: 'DELETE' });
    toast(`${student.fullName} removed.`);
    await loadCourse();
  } catch (error) {
    toast(error.message, { error: true });
  }
}

// Search and tick students who are not in the course yet.
function openAddStudents() {
  const picked = new Map();
  const list = h('ul', { class: 'pick-list', 'aria-label': 'Students you can add' });
  const count = h('p', { class: 'field__help', 'aria-live': 'polite' }, 'No students picked yet.');
  const search = buildField({ name: 'search', label: 'Find a student', required: false, plainLabel: true, placeholder: 'Name or matric number…' });
  let timer = null;

  async function refresh() {
    const term = search.control.value.trim();
    try {
      const query = new URLSearchParams({ excludeCourseId: course.id });
      if (term) query.set('search', term);
      const { students, total } = await api(`/students?${query}`);
      if (students.length === 0) {
        mount(list, h('li', { class: 'pick-list__empty' }, term ? `No student matches "${term}".` : 'Every student is already in this course.'));
        return;
      }
      mount(
        list,
        students.map((s) =>
          h('li', {}, h('label', {},
            h('input', {
              type: 'checkbox',
              checked: picked.has(s.id),
              onchange: (event) => {
                if (event.target.checked) picked.set(s.id, s);
                else picked.delete(s.id);
                count.textContent = picked.size ? `${plural(picked.size, 'student')} picked.` : 'No students picked yet.';
              },
            }),
            h('span', {}, s.fullName, ' ', h('span', { class: 'muted num' }, s.matricNo)),
          )),
        ),
        total > students.length ? h('li', { class: 'pick-list__empty' }, `Showing the first ${students.length} of ${total}. Search to narrow the list.`) : null,
      );
    } catch (error) {
      mount(list, h('li', { class: 'pick-list__empty' }, error.message));
    }
  }

  search.control.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 250);
  });
  refresh();

  formDialog({
    title: `Add students to ${course.code}`,
    fields: [],
    extra: [search.wrapper, list, count],
    submitLabel: 'Add to course',
    busyLabel: 'Adding',
    onSubmit: async () => {
      if (picked.size === 0) {
        search.setError('Tick at least one student.');
        return false;
      }
      const { added } = await api(`/courses/${course.id}/students`, { method: 'POST', body: { studentIds: [...picked.keys()] } });
      toast(`${plural(added, 'student')} added to ${course.code}.`);
      await loadCourse();
      return true;
    },
  });
}

// Add everyone in a department and level in one go.
async function openAddGroup() {
  let options;
  try {
    options = await api('/students/filters');
  } catch (error) {
    toast(error.message, { error: true });
    return;
  }
  if (options.departments.length === 0) {
    toast('There are no students yet. Add students first.', { error: true });
    return;
  }
  formDialog({
    title: `Add a whole class to ${course.code}`,
    intro: 'Everyone in the department and level you pick is added. Students already in the course stay as they are.',
    fields: [
      { name: 'department', label: 'Department', type: 'select', options: [{ value: '', label: 'Choose a department' }, ...options.departments.map((d) => ({ value: d, label: d }))] },
      { name: 'level', label: 'Level', type: 'select', options: [{ value: '', label: 'Choose a level' }, ...options.levels.map((l) => ({ value: l, label: l }))] },
    ],
    submitLabel: 'Add class to course',
    busyLabel: 'Adding',
    onSubmit: async (values) => {
      const { added } = await api(`/courses/${course.id}/students`, { method: 'POST', body: values });
      toast(added ? `${plural(added, 'student')} added to ${course.code}.` : 'No new students matched. Nobody was added.');
      await loadCourse();
    },
  });
}

// ---------- Report ----------

const STANDING = {
  ok: { label: 'Meets minimum', class: 'badge badge--ok' },
  at_risk: { label: 'Below minimum', class: 'badge badge--risk' },
  no_data: { label: 'No classes yet', class: 'badge badge--neutral' },
};

function loadReport() {
  return loadInto(panel, () => api(`/courses/${course.id}/report`), ({ report }) => {
    if (report.students.length === 0) {
      showEmpty(panel, {
        title: 'Nothing to report yet',
        text: 'Add students to this course and take attendance. The report builds itself from the register.',
      });
      return;
    }

    const onlyBelow = getParam('below') === '1';
    const rows = onlyBelow ? report.students.filter((s) => s.standing === 'at_risk') : report.students;
    const summary =
      `${plural(report.sessionsHeld, 'class', 'classes')} held. ` +
      `${report.atRiskCount} of ${plural(report.students.length, 'student')} ${report.atRiskCount === 1 ? 'is' : 'are'} below ${report.minAttendance}%.`;

    const filter = h('label', { class: 'pick-list__toggle' },
      h('input', {
        type: 'checkbox',
        checked: onlyBelow,
        onchange: (event) => {
          setParams({ below: event.target.checked ? '1' : '' });
          loadReport();
        },
      }),
      ' Show only students below the minimum');

    mount(
      panel,
      h(
        'div',
        { class: 'section__head' },
        h('div', {}, h('h2', {}, 'Attendance report'), h('p', { class: 'muted' }, summary)),
        h('a', { class: 'btn btn--secondary', href: `/api/courses/${course.id}/report?format=csv`, download: '' }, 'Download as CSV'),
      ),
      h('p', { class: 'report-filter' }, filter),
      rows.length
        ? buildTable({
            caption: `Attendance report for ${course.code}`,
            rowClass: (s) => (s.standing === 'at_risk' ? 'is-flagged' : null),
            columns: [
              { label: 'Name', primary: true, cell: (s) => s.fullName },
              { label: 'Matric number', cell: (s) => h('span', { class: 'num' }, s.matricNo) },
              { label: 'Present', numeric: true, cell: (s) => s.present },
              { label: 'Late', numeric: true, cell: (s) => s.late },
              { label: 'Absent', numeric: true, cell: (s) => s.absent },
              { label: 'Excused', numeric: true, cell: (s) => s.excused },
              { label: 'Attendance', numeric: true, cell: (s) => formatPercent(s.percent) },
              { label: 'Standing', cell: (s) => h('span', { class: STANDING[s.standing].class }, STANDING[s.standing].label) },
            ],
            rows,
          })
        : h('div', { class: 'state' }, h('h2', {}, 'Nobody is below the minimum'), h('p', {}, `Every student in ${course.code} is at ${report.minAttendance}% or higher.`)),
      h('p', { class: 'field__help report-note' },
        'Present and late both count as attended. Excused classes are left out of the total. A class with no mark counts as absent.'),
    );
  });
}

if (!Number.isInteger(courseId) || courseId < 1) {
  $('#course-title').textContent = 'Course';
  showError(panel, { message: 'That course link is not valid. Go back to the courses list and open it again.' });
} else {
  loadCourse();
}
