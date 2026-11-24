import { api } from '../lib/api.js';
import { $, h, mount } from '../lib/dom.js';
import { plural } from '../lib/format.js';
import { getParam, initPage, setParams } from '../lib/shell.js';
import { icon } from '../lib/icons.js';
import { asSearchField, button, buildField, buildTable, confirmDialog, formDialog, infoDialog, person, rateBar, showEmpty, showError, showLoading, toast } from '../lib/ui.js';

const user = await initPage({ active: 'students' });
const isAdmin = user.role === 'admin';
const results = $('#results');
let filterOptions = { departments: [], levels: [] };

if (isAdmin) {
  mount(
    $('#page-actions'),
    button('Import a list', { icon: 'upload', variant: 'secondary', onclick: openImport }),
    button('Add student', { icon: 'userPlus', onclick: () => openStudentForm() }),
  );
}

// ---------- Search and filters (kept in the address bar) ----------

const search = buildField({ name: 'search', label: 'Find a student', required: false, plainLabel: true, value: getParam('search'), placeholder: 'Name or matric number…' });
asSearchField(search);
const department = h('select', { class: 'select', id: 'filter-department' });
const level = h('select', { class: 'select', id: 'filter-level' });

mount(
  $('#toolbar'),
  search.wrapper,
  h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'filter-department' }, 'Department'), department),
  h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'filter-level' }, 'Level'), level),
);

let searchTimer = null;
search.control.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    setParams({ search: search.control.value.trim(), page: '' });
    load();
  }, 300);
});
department.addEventListener('change', () => {
  setParams({ department: department.value, page: '' });
  load();
});
level.addEventListener('change', () => {
  setParams({ level: level.value, page: '' });
  load();
});

async function loadFilters() {
  try {
    filterOptions = await api('/students/filters');
  } catch {
    // The list still works without the dropdowns.
  }
  const fill = (select, allLabel, values, current) =>
    mount(select, h('option', { value: '' }, allLabel), values.map((value) => h('option', { value, selected: value === current }, value)));
  fill(department, 'All departments', filterOptions.departments, getParam('department'));
  fill(level, 'All levels', filterOptions.levels, getParam('level'));
}

// ---------- List ----------

let requestNo = 0;

async function load() {
  const thisRequest = (requestNo += 1);
  showLoading(results, 'Loading students');
  const query = new URLSearchParams();
  for (const name of ['search', 'department', 'level', 'page']) {
    if (getParam(name)) query.set(name, getParam(name));
  }
  let data;
  try {
    data = await api(`/students?${query}`);
  } catch (error) {
    if (thisRequest === requestNo) showError(results, error, load);
    return;
  }
  // A slower, older search must not overwrite a newer one.
  if (thisRequest !== requestNo) return;
  render(data);
}

function render({ students, total, page, pageCount }) {
  const filtered = Boolean(getParam('search') || getParam('department') || getParam('level'));
  if (total === 0) {
    showEmpty(results, filtered
      ? { iconName: 'search', title: 'No student matches', text: 'Check the spelling or clear the filters.' }
      : isAdmin
        ? {
            iconName: 'students',
            title: 'No students yet',
            text: 'Add students one at a time, or paste a whole class list with Import a list.',
            action: button('Import a list', { icon: 'upload', onclick: openImport }),
          }
        : { iconName: 'students', title: 'No students yet', text: 'An administrator adds students. They will show up here once that is done.' });
    return;
  }

  const columns = [
    {
      label: 'Name',
      primary: true,
      cell: (s) => h('button', { class: 'btn btn--quiet name-button', type: 'button', onclick: () => openAttendance(s), 'aria-label': `${s.fullName}, see attendance` }, person(s.fullName, s.matricNo)),
    },
    { label: 'Department', cell: (s) => s.department },
    { label: 'Level', cell: (s) => s.level },
  ];
  if (isAdmin) {
    columns.push({
      label: 'Actions',
      actions: true,
      cell: (s) => [
        button('Edit', { variant: 'quiet', ariaLabel: `Edit ${s.fullName}`, onclick: () => openStudentForm(s) }),
        button('Delete', { variant: 'quiet btn--danger-text', ariaLabel: `Delete ${s.fullName}`, onclick: () => deleteStudent(s) }),
      ],
    });
  }

  const goTo = (target) => {
    setParams({ page: target > 1 ? target : '' }, { replace: false });
    load();
    window.scrollTo({ top: 0 });
  };

  mount(
    results,
    buildTable({ caption: 'Students', columns, rows: students }),
    h(
      'div',
      { class: 'pagination' },
      h('span', {}, `${plural(total, 'student')}. Page ${page} of ${pageCount}.`),
      pageCount > 1
        ? h(
            'div',
            { class: 'pagination__buttons' },
            h('button', { class: 'btn btn--secondary', type: 'button', disabled: page <= 1, onclick: () => goTo(page - 1) }, icon('prev'), 'Previous'),
            h('button', { class: 'btn btn--secondary', type: 'button', disabled: page >= pageCount, onclick: () => goTo(page + 1) }, 'Next', icon('next')),
          )
        : null,
    ),
  );
}

window.addEventListener('popstate', load);

// ---------- Add, edit, delete ----------

function openStudentForm(student = null) {
  formDialog({
    title: student ? 'Edit student' : 'Add student',
    submitLabel: student ? 'Save changes' : 'Add student',
    fields: [
      { name: 'fullName', label: 'Full name', value: student?.fullName, autocomplete: 'off' },
      { name: 'matricNo', label: 'Matric number', value: student?.matricNo, placeholder: 'Example: CSC/24/0001…' },
      { name: 'department', label: 'Department', value: student?.department, datalist: filterOptions.departments },
      { name: 'level', label: 'Level', value: student?.level, datalist: filterOptions.levels, placeholder: 'Example: 200 Level…' },
    ],
    onSubmit: async (values) => {
      if (student) await api(`/students/${student.id}`, { method: 'PATCH', body: values });
      else await api('/students', { method: 'POST', body: values });
      toast(student ? 'Student saved.' : 'Student added.');
      await Promise.all([loadFilters(), load()]);
    },
  });
}

async function deleteStudent(student) {
  const confirmed = await confirmDialog({
    title: `Delete ${student.fullName}?`,
    text: 'This removes the student from every course and deletes all their attendance marks. This cannot be undone.',
    confirmLabel: 'Delete student',
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api(`/students/${student.id}`, { method: 'DELETE' });
    toast('Student deleted.');
    await Promise.all([loadFilters(), load()]);
  } catch (error) {
    toast(error.message, { error: true });
  }
}

// ---------- Import a pasted list ----------

// One student per line: matric number, full name, department, level.
// Commas or tabs both work, so a list copied from Excel pastes straight in.
function parseList(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [matricNo = '', fullName = '', dept = '', lvl = ''] = line.split(/\t|,/).map((part) => part.trim());
      return { matricNo, fullName, department: dept, level: lvl };
    });
}

function openImport() {
  formDialog({
    title: 'Import a list of students',
    intro: 'Paste one student per line in this order: matric number, full name, department, level. Separate them with commas, or copy the four columns straight from Excel.',
    wide: true,
    fields: [
      {
        name: 'list',
        label: 'Student list',
        type: 'textarea',
        rows: 8,
        placeholder: 'CSC/24/0001, Adaeze Nwosu, Computer Science, 200 Level\nCSC/24/0002, Daniel Ojo, Computer Science, 200 Level…',
        help: 'Up to 500 students at a time. Students already on the list are skipped.',
      },
    ],
    submitLabel: 'Import students',
    busyLabel: 'Importing',
    onSubmit: async (values) => {
      const students = parseList(values.list);
      try {
        const { added, skipped } = await api('/students/import', { method: 'POST', body: { students } });
        toast(`${plural(added, 'student')} added.${skipped.length ? ` ${skipped.length} already on the list, skipped.` : ''}`);
      } catch (error) {
        // Point at the exact lines that could not be read.
        if (error.details?.rows?.length) {
          const lines = error.details.rows.map((r) => `Line ${r.row}: ${r.message}`).join(' ');
          error.fields = { list: `Nothing was imported. ${lines}` };
        } else if (error.fields?.students) {
          error.fields = { list: error.fields.students };
        }
        throw error;
      }
      await Promise.all([loadFilters(), load()]);
    },
  });
}

// ---------- One student's attendance ----------

async function openAttendance(student) {
  let data;
  try {
    data = await api(`/students/${student.id}/attendance`);
  } catch (error) {
    toast(error.message, { error: true });
    return;
  }
  const standing = {
    ok: h('span', { class: 'badge badge--ok' }, 'Meets minimum'),
    at_risk: h('span', { class: 'badge badge--risk' }, 'Below minimum'),
    no_data: h('span', { class: 'badge badge--neutral' }, 'No classes yet'),
  };
  const body = data.courses.length
    ? buildTable({
        caption: `Attendance for ${student.fullName}`,
        columns: [
          { label: 'Course', primary: true, cell: (c) => h('a', { href: `/course?id=${c.courseId}&tab=report` }, c.code) },
          { label: 'Attended', numeric: true, cell: (c) => `${c.present + c.late} of ${c.held - c.excused}` },
          { label: 'Attendance', cell: (c) => rateBar(c.percent, c.minAttendance) },
          { label: 'Standing', cell: (c) => standing[c.standing].cloneNode(true) },
        ],
        rows: data.courses,
      })
    : h('p', { class: 'dialog__text' }, isAdmin ? 'This student is not in any course yet.' : 'This student is not in any of your courses.');

  infoDialog({
    title: student.fullName,
    wide: true,
    content: h('div', {}, h('p', { class: 'dialog__text num' }, `${student.matricNo}. ${student.department}, ${student.level}.`), body),
  });
}

await loadFilters();
load();
