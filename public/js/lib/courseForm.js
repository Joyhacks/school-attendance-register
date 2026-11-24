// The add / edit course dialog, shared by the courses list and the course page.
import { api } from './api.js';
import { formDialog, toast } from './ui.js';

export async function openCourseForm(course, onSaved) {
  const { lecturers } = await api('/lecturers');
  return formDialog({
    title: course ? 'Edit course' : 'Add course',
    submitLabel: course ? 'Save changes' : 'Add course',
    fields: [
      { name: 'code', label: 'Course code', value: course?.code, placeholder: 'Example: CSC 201…' },
      { name: 'title', label: 'Course title', value: course?.title, placeholder: 'Example: Data Structures…' },
      {
        name: 'lecturerId',
        label: 'Lecturer',
        type: 'select',
        required: false,
        value: course?.lecturerId ?? '',
        options: [{ value: '', label: 'Not assigned yet' }, ...lecturers.map((l) => ({ value: l.id, label: l.fullName }))],
        help: 'The lecturer marks the register for this course.',
      },
      {
        name: 'minAttendance',
        label: 'Minimum attendance (%)',
        type: 'number',
        inputmode: 'numeric',
        min: 0,
        max: 100,
        value: course?.minAttendance ?? 75,
        help: 'Students below this are flagged in the report.',
      },
    ],
    onSubmit: async (values) => {
      const body = {
        code: values.code,
        title: values.title,
        lecturerId: values.lecturerId ? Number(values.lecturerId) : null,
        minAttendance: Number(values.minAttendance),
      };
      if (course) await api(`/courses/${course.id}`, { method: 'PATCH', body });
      else await api('/courses', { method: 'POST', body });
      toast(course ? 'Course saved.' : 'Course added.');
      await onSaved();
    },
  });
}
