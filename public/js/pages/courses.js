import { api } from '../lib/api.js';
import { $, h, mount } from '../lib/dom.js';
import { formatDate } from '../lib/format.js';
import { initPage } from '../lib/shell.js';
import { openCourseForm } from '../lib/courseForm.js';
import { button, buildTable, confirmDialog, courseCell, loadInto, rateBar, showEmpty, toast } from '../lib/ui.js';

const user = await initPage({ active: 'courses' });
const isAdmin = user.role === 'admin';
const content = $('#content');

if (isAdmin) {
  mount($('#page-actions'), button('Add course', { icon: 'plus', onclick: () => openCourseForm(null, load) }));
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
          iconName: 'courses',
          title: 'No courses yet',
          text: 'Add a course, assign a lecturer and put students in it. After that the lecturer can mark the register.',
          action: button('Add course', { icon: 'plus', onclick: () => openCourseForm(null, load) }),
        }
      : { iconName: 'courses', title: 'No courses are assigned to you yet', text: 'Ask an administrator to assign your courses.' });
    return;
  }

  const columns = [
    { label: 'Course', primary: true, cell: (c) => courseCell(c) },
    { label: 'Lecturer', cell: (c) => c.lecturerName || h('span', { class: 'muted' }, 'Not assigned') },
    { label: 'Students', numeric: true, cell: (c) => c.studentCount },
    { label: 'Classes', numeric: true, cell: (c) => c.sessionCount },
    { label: 'Attendance', cell: (c) => rateBar(c.attendanceRate, c.minAttendance) },
    { label: 'Last class', cell: (c) => h('span', { class: 'nowrap' }, c.lastSessionDate ? formatDate(c.lastSessionDate) : 'None yet') },
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
