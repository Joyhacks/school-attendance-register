// One-time setup on a fresh install: the first admin account and,
// if ticked, the demo data. The setup code is in the server log.
import { api } from '../lib/api.js';
import { $, h, mount } from '../lib/dom.js';
import { fillSchoolPanel } from '../lib/portal.js';
import { buildField, submitFields } from '../lib/ui.js';

async function start() {
  await fillSchoolPanel('Set up');

  const { needsSetup } = await api('/setup/status');
  if (!needsSetup) {
    window.location.replace('/');
    return;
  }

  const fields = [
    buildField({ name: 'setupCode', label: 'Setup code', placeholder: 'ABCD-EFGH…', autocomplete: 'off', help: 'Find it in the server log, on the line that starts with "Setup code".' }),
    buildField({ name: 'fullName', label: 'Your full name', autocomplete: 'name' }),
    buildField({ name: 'email', label: 'Email', type: 'email', inputmode: 'email', autocomplete: 'username', help: 'You sign in with this.' }),
    buildField({ name: 'password', label: 'Password', type: 'password', autocomplete: 'new-password', help: 'At least 8 characters.' }),
  ];
  const demo = h('input', { type: 'checkbox', id: 'demo-data', checked: true });
  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const button = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Create admin account');

  const form = h(
    'form',
    {
      novalidate: true,
      onsubmit: async (event) => {
        event.preventDefault();
        await submitFields({
          fields,
          formError,
          button,
          busyLabel: 'Setting up',
          onSubmit: async (values) => {
            const result = await api('/setup', { method: 'POST', body: { ...values, demoData: demo.checked } });
            showDone(result);
          },
        });
      },
    },
    formError,
    fields.map((field) => field.wrapper),
    h('label', { class: 'pick-list__toggle setup-demo', for: 'demo-data' }, demo, ' Add demo students, courses and attendance'),
    button,
  );
  mount($('#setup-form'), form);
}

function showDone({ demo }) {
  mount(
    $('#setup-form'),
    h(
      'div',
      { class: 'stack', role: 'status' },
      h('h2', {}, 'The system is ready'),
      h('p', {}, 'Sign in with the email and password you just chose.'),
      demo
        ? h(
            'div',
            { class: 'panel panel--pad' },
            h('p', {}, h('strong', {}, 'Demo lecturer logins. Write the password down, it is shown once.')),
            h('dl', { class: 'detail-list setup-logins' },
              demo.emails.map((email) => [h('dt', {}, 'Email'), h('dd', {}, email)]),
              h('dt', {}, 'Password'), h('dd', { class: 'num' }, demo.password)),
          )
        : null,
      h('a', { class: 'btn btn--primary btn--block', href: '/' }, 'Go to sign in'),
    ),
  );
}

start().catch((error) => {
  mount($('#setup-form'), h('p', { class: 'form-error', role: 'alert' }, error.message));
});
