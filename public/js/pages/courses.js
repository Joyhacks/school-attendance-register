import { api } from '../lib/api.js';
import { $, h, mount } from '../lib/dom.js';
import { formatDate } from '../lib/format.js';
import { initPage } from '../lib/shell.js';
import { openCourseForm } from '../lib/courseForm.js';
import { buildTable, confirmDialog, loadInto, showEmpty, toast } from '../lib/ui.js';

const user = await initPage({ active: 'courses' });
const isAdmin = user.role === 'admin';
const content = $('#content');

if (isAdmin) {
  mount($('#page-actions'), h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openCourseForm(null, load) }, 'Add course'));
}

function load() {
  return loadInto(content, () => api('/courses'), render);
}

async function deleteCourse(course) {
  const confirmed = await confirmDialog({
    title: `Delete ${course.code}?`,
    text: `This removes the course, its ${course.sessionCount} classes and every attendance mark in it. This cannot be undone.`,
    confirmLabel: 'Delete course',
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api(`/courses/${course.id}`, { method: 'DELETE' });
    toast('Course deleted.');
    load();
  } catch (error) {
    toast(error.message, { error: true });
  }
}

function render({ courses }) {
  if (courses.length === 0) {
    showEmpty(content, isAdmin
      ? {
          title: 'No courses yet',
          text: 'Add a course, assign a lecturer and put students in it. After that the lecturer can mark the register.',
          action: h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openCourseForm(null, load) }, 'Add course'),
        }
      : { title: 'No courses are assigned to you yet', text: 'Ask an admin to assign your courses.' });
    return;
  }

  const columns = [
    { label: 'Course', primary: true, cell: (c) => h('a', { href: `/course?id=${c.id}` }, `${c.code} ${c.title}`) },
    { label: 'Lecturer', cell: (c) => c.lecturerName || 'Not assigned' },
    { label: 'Students', numeric: true, cell: (c) => c.studentCount },
    { label: 'Classes held', numeric: true, cell: (c) => c.sessionCount },
    { label: 'Last class', cell: (c) => (c.lastSessionDate ? formatDate(c.lastSessionDate) : 'None yet') },
  ];
  if (isAdmin) {
    columns.push({
      label: 'Actions',
      actions: true,
      cell: (c) => [
        h('button', { class: 'btn btn--quiet', type: 'button', 'aria-label': `Edit ${c.code}`, onclick: () => openCourseForm(c, load) }, 'Edit'),
        h('button', { class: 'btn btn--quiet btn--danger-text', type: 'button', 'aria-label': `Delete ${c.code}`, onclick: () => deleteCourse(c) }, 'Delete'),
      ],
    });
  }
  mount(content, buildTable({ caption: 'Courses', columns, rows: courses }));
}

load();
