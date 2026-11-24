// The register for one class. Built for a phone held in one hand:
// big marks per student, a running tally and one save button.
import { api } from '../lib/api.js';
import { $, h, mount } from '../lib/dom.js';
import { STATUS_LABELS, formatDate, periodLabel, plural } from '../lib/format.js';
import { getParam, initPage } from '../lib/shell.js';
import { buildField, showEmpty, showError, showLoading, toast, withBusy } from '../lib/ui.js';

await initPage({ active: 'courses' });

const sessionId = Number(getParam('class'));
const content = $('#content');
const STATUSES = Object.keys(STATUS_LABELS);

// studentId -> status as last saved, and as currently ticked on screen.
const saved = new Map();
const marks = new Map();
let register = [];
let tallyEl = null;
let saveNote = null;

const isDirty = () => register.some((row) => marks.get(row.studentId) !== saved.get(row.studentId));

// Warn before leaving with marks that are not saved yet.
window.addEventListener('beforeunload', (event) => {
  if (isDirty()) event.preventDefault();
});

async function load() {
  showLoading(content, 'Loading the register');
  let data;
  try {
    data = await api(`/sessions/${sessionId}`);
  } catch (error) {
    showError(content, error, load);
    return;
  }
  const { session, course } = data;
  register = data.register;
  saved.clear();
  marks.clear();
  for (const row of register) {
    if (row.status) {
      saved.set(row.studentId, row.status);
      marks.set(row.studentId, row.status);
    }
  }

  document.title = `${course.code} register | Attendance Register`;
  $('#back-link').textContent = `Back to ${course.code}`;
  $('#back-link').href = `/course?id=${course.id}`;
  $('#register-title').textContent = `${course.code} register`;
  $('#register-meta').textContent =
    `${formatDate(session.date)}, ${periodLabel(session.period)}.${session.topic ? ` Topic: ${session.topic}.` : ''}`;

  if (register.length === 0) {
    showEmpty(content, {
      title: 'Nobody is in this course yet',
      text: 'Add students to the course first. They will then appear on this register.',
      action: h('a', { class: 'btn btn--primary', href: `/course?id=${course.id}&tab=students` }, 'Add students'),
    });
    return;
  }
  render();
}

function markControl(row) {
  return h(
    'fieldset',
    { class: 'marks' },
    h('legend', { class: 'visually-hidden' }, `Mark for ${row.fullName}`),
    STATUSES.map((status) =>
      h(
        'label',
        { class: `mark mark--${status}` },
        h('input', {
          type: 'radio',
          name: `mark-${row.studentId}`,
          value: status,
          checked: marks.get(row.studentId) === status,
          onchange: () => {
            marks.set(row.studentId, status);
            updateTally();
          },
        }),
        h('span', {}, STATUS_LABELS[status]),
      ),
    ),
  );
}

function render() {
  const list = h('ol', { class: 'register' });
  const noMatch = h('p', { class: 'muted', hidden: true }, 'No student on this register matches that search.');

  const rows = register.map((row, index) => {
    const el = h(
      'li',
      { class: 'register__row' },
      h('span', { class: 'register__no', 'aria-hidden': 'true' }, index + 1),
      h('div', {}, h('div', { class: 'register__name' }, row.fullName), h('div', { class: 'register__matric' }, row.matricNo)),
      markControl(row),
    );
    return { row, el, haystack: `${row.fullName} ${row.matricNo}`.toLowerCase() };
  });
  list.append(...rows.map((r) => r.el));

  const search = buildField({ name: 'find', label: 'Find a student', required: false, plainLabel: true, placeholder: 'Name or matric number…' });
  search.control.type = 'search';
  search.control.addEventListener('input', () => {
    const term = search.control.value.trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const match = r.haystack.includes(term);
      r.el.hidden = !match;
      if (match) shown += 1;
    }
    noMatch.hidden = shown > 0;
  });

  const markRest = h(
    'button',
    {
      class: 'btn btn--secondary',
      type: 'button',
      onclick: () => {
        let changed = 0;
        for (const { row, el } of rows) {
          if (marks.has(row.studentId)) continue;
          marks.set(row.studentId, 'present');
          el.querySelector('input[value="present"]').checked = true;
          changed += 1;
        }
        updateTally();
        toast(changed ? `${plural(changed, 'student')} marked present. Now change the ones who are not here.` : 'Everyone already has a mark.');
      },
    },
    'Mark the rest present',
  );

  tallyEl = h('dl', { class: 'tally', 'aria-label': 'Tally' });
  saveNote = h('span', { class: 'save-bar__note', role: 'status' });
  const saveButton = h('button', { class: 'btn btn--primary', type: 'button', onclick: () => save(saveButton) }, 'Save register');

  mount(
    content,
    h('div', { class: 'register-tools' }, search.wrapper, markRest),
    noMatch,
    list,
    h('div', { class: 'save-bar' }, h('div', { class: 'save-bar__info' }, tallyEl, saveNote), saveButton),
  );
  updateTally();
}

function updateTally() {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const status of marks.values()) counts[status] += 1;
  const unmarked = register.length - marks.size;
  mount(
    tallyEl,
    STATUSES.map((status) => h('div', {}, h('dt', {}, STATUS_LABELS[status]), h('dd', {}, counts[status]))),
    h('div', {}, h('dt', {}, 'Not marked'), h('dd', {}, unmarked)),
  );
  saveNote.textContent = isDirty() ? 'Not saved yet' : '';
}

async function save(button) {
  const records = [...marks].map(([studentId, status]) => ({ studentId, status }));
  if (records.length === 0) {
    toast('Mark at least one student before saving.', { error: true });
    return;
  }
  try {
    await withBusy(button, 'Saving', () => api(`/sessions/${sessionId}/attendance`, { method: 'PUT', body: { records } }));
    for (const [studentId, status] of marks) saved.set(studentId, status);
    updateTally();
    const unmarked = register.length - marks.size;
    toast(unmarked ? `Register saved. ${plural(unmarked, 'student')} still not marked.` : 'Register saved. Everyone is marked.');
  } catch (error) {
    // Nothing is lost on a failed save. The marks stay on screen to retry.
    toast(`${error.message} Your marks are still on screen. Press Save register again.`, { error: true });
  }
}

if (!Number.isInteger(sessionId) || sessionId < 1) {
  showError(content, { message: 'That register link is not valid. Open the class from its course page.' });
} else {
  load();
}
