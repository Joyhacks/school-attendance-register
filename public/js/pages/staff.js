import { api } from '../lib/api.js';
import { $, h, mount } from '../lib/dom.js';
import { initPage } from '../lib/shell.js';
import { buildTable, confirmDialog, formDialog, loadInto, toast } from '../lib/ui.js';

const user = await initPage({ active: 'staff', adminOnly: true });
const content = $('#content');
const ROLE_OPTIONS = [
  { value: 'lecturer', label: 'Lecturer (marks registers for own courses)' },
  { value: 'admin', label: 'Admin (manages everything)' },
];
const PASSWORD_HELP = 'At least 8 characters. Give it to them in person. They can change it under My account.';

mount($('#page-actions'), h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openStaffForm() }, 'Add staff account'));

function load() {
  return loadInto(content, () => api('/users'), render);
}

function openStaffForm(member = null) {
  const fields = [
    { name: 'fullName', label: 'Full name', value: member?.fullName },
    { name: 'email', label: 'Email', type: 'email', inputmode: 'email', value: member?.email, help: 'They sign in with this email.' },
    { name: 'role', label: 'Role', type: 'select', value: member?.role || 'lecturer', options: ROLE_OPTIONS },
  ];
  if (!member) fields.push({ name: 'password', label: 'First password', type: 'password', autocomplete: 'new-password', help: PASSWORD_HELP });

  formDialog({
    title: member ? 'Edit staff account' : 'Add staff account',
    submitLabel: member ? 'Save changes' : 'Add account',
    fields,
    onSubmit: async (values) => {
      if (member) await api(`/users/${member.id}`, { method: 'PATCH', body: values });
      else await api('/users', { method: 'POST', body: values });
      toast(member ? 'Account saved.' : 'Account added.');
      await load();
    },
  });
}

function openResetPassword(member) {
  formDialog({
    title: `Reset password for ${member.fullName}`,
    intro: 'They will be signed out everywhere and must use the new password.',
    submitLabel: 'Reset password',
    fields: [{ name: 'newPassword', label: 'New password', type: 'password', autocomplete: 'new-password', help: PASSWORD_HELP }],
    onSubmit: async (values) => {
      await api(`/users/${member.id}/reset-password`, { method: 'POST', body: values });
      toast('Password reset.');
    },
  });
}

async function setActive(member, isActive) {
  if (!isActive) {
    const confirmed = await confirmDialog({
      title: `Deactivate ${member.fullName}?`,
      text: 'They will be signed out and will not be able to sign in. Their courses and registers stay as they are. You can reactivate the account later.',
      confirmLabel: 'Deactivate account',
      danger: true,
    });
    if (!confirmed) return;
  }
  try {
    await api(`/users/${member.id}`, { method: 'PATCH', body: { isActive } });
    toast(isActive ? 'Account reactivated.' : 'Account deactivated.');
    load();
  } catch (error) {
    toast(error.message, { error: true });
  }
}

function render({ users }) {
  mount(
    content,
    buildTable({
      caption: 'Staff accounts',
      columns: [
        { label: 'Name', primary: true, cell: (m) => (m.id === user.id ? `${m.fullName} (you)` : m.fullName) },
        { label: 'Email', cell: (m) => m.email },
        { label: 'Role', cell: (m) => (m.role === 'admin' ? 'Admin' : 'Lecturer') },
        { label: 'Courses', numeric: true, cell: (m) => m.courseCount },
        {
          label: 'Status',
          cell: (m) => h('span', { class: m.isActive ? 'badge badge--ok' : 'badge badge--neutral' }, m.isActive ? 'Active' : 'Deactivated'),
        },
        {
          label: 'Actions',
          actions: true,
          cell: (m) => [
            h('button', { class: 'btn btn--quiet', type: 'button', 'aria-label': `Edit ${m.fullName}`, onclick: () => openStaffForm(m) }, 'Edit'),
            h('button', { class: 'btn btn--quiet', type: 'button', 'aria-label': `Reset password for ${m.fullName}`, onclick: () => openResetPassword(m) }, 'Reset password'),
            m.id === user.id
              ? null
              : m.isActive
                ? h('button', { class: 'btn btn--quiet btn--danger-text', type: 'button', 'aria-label': `Deactivate ${m.fullName}`, onclick: () => setActive(m, false) }, 'Deactivate')
                : h('button', { class: 'btn btn--quiet', type: 'button', 'aria-label': `Reactivate ${m.fullName}`, onclick: () => setActive(m, true) }, 'Reactivate'),
          ],
        },
      ],
      rows: users,
    }),
  );
}

load();
