// The "Take attendance" dialog, used from the dashboard and the course page.
import { ApiError, api } from './api.js';
import { periodLabel, todayIso } from './format.js';
import { formDialog } from './ui.js';

// courses: list the user can pick from. presetCourseId: skip the picker.
// On success the browser goes straight to the register for that class.
export function openTakeAttendance(courses, presetCourseId = null) {
  const fields = [];
  if (!presetCourseId) {
    fields.push({
      name: 'courseId',
      label: 'Course',
      type: 'select',
      options: [{ value: '', label: 'Choose a course' }, ...courses.map((c) => ({ value: c.id, label: `${c.code} ${c.title}` }))],
    });
  }
  fields.push(
    { name: 'date', label: 'Date of class', type: 'date', value: todayIso(), max: todayIso() },
    {
      name: 'period',
      label: 'Which class is this?',
      type: 'select',
      value: 1,
      options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: periodLabel(n) })),
      help: 'Only change this when the course meets more than once on the same day.',
    },
    { name: 'topic', label: 'Topic', required: false, placeholder: 'Example: Linked lists…' },
  );

  return formDialog({
    title: 'Take attendance',
    fields,
    submitLabel: 'Open register',
    busyLabel: 'Opening',
    onSubmit: async (values) => {
      const courseId = presetCourseId || Number(values.courseId);
      try {
        const { session } = await api(`/courses/${courseId}/sessions`, {
          method: 'POST',
          body: { date: values.date, period: Number(values.period), topic: values.topic },
        });
        window.location.assign(`/register?class=${session.id}`);
      } catch (error) {
        // The register for this class already exists: open it instead.
        if (error instanceof ApiError && error.status === 409 && error.details?.existingSessionId) {
          window.location.assign(`/register?class=${error.details.existingSessionId}`);
          return;
        }
        throw error;
      }
    },
  });
}
