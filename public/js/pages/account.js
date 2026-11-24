import { api } from '../lib/api.js';
import { $, h, mount } from '../lib/dom.js';
import { initPage } from '../lib/shell.js';
import { icon } from '../lib/icons.js';
import { avatar, buildField, submitFields, toast } from '../lib/ui.js';

const user = await initPage({ active: 'account' });

mount(
  $('#details'),
  h('div', { class: 'profile' },
    avatar(user.fullName, 'deep'),
    h('div', {}, h('h2', {}, user.fullName), h('p', { class: 'section__sub' }, user.role === 'admin' ? 'Administrator' : 'Lecturer'))),
  h(
    'dl',
    { class: 'detail-list' },
    h('dt', {}, 'Email'), h('dd', {}, user.email),
    h('dt', {}, 'Role'), h('dd', {}, user.role === 'admin' ? 'Administrator' : 'Lecturer'),
  ),
);

const fields = [
  buildField({ name: 'currentPassword', label: 'Current password', type: 'password', autocomplete: 'current-password' }),
  buildField({ name: 'newPassword', label: 'New password', type: 'password', autocomplete: 'new-password', help: 'At least 8 characters.' }),
];
const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
const button = h('button', { class: 'btn btn--primary', type: 'submit' }, icon('key'), 'Change password');

const form = h(
  'form',
  {
    novalidate: true,
    onsubmit: async (event) => {
      event.preventDefault();
      const ok = await submitFields({
        fields,
        formError,
        button,
        busyLabel: 'Changing',
        onSubmit: (values) => api('/auth/change-password', { method: 'POST', body: values }).then(() => true),
      });
      if (ok) {
        form.reset();
        toast('Password changed. Other devices have been signed out.');
      }
    },
  },
  formError,
  fields.map((field) => field.wrapper),
  button,
);

mount($('#password-form'), form);
