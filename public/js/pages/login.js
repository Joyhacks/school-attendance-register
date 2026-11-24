import { api } from '../lib/api.js';
import { $, h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { fillSchoolPanel } from '../lib/portal.js';
import { buildField, submitFields } from '../lib/ui.js';

// Only follow "next" when it is a path on this site. Stops a crafted
// link from sending someone to another website after sign-in.
function nextPath() {
  const next = new URLSearchParams(window.location.search).get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/dashboard';
}

async function start() {
  await fillSchoolPanel('Sign in');

  // A fresh install has no admin yet: send the visitor to setup.
  try {
    const { needsSetup } = await api('/setup/status');
    if (needsSetup) {
      window.location.replace('/setup');
      return;
    }
  } catch {
    // Carry on to the sign-in form.
  }

  try {
    const { signedIn } = await api('/auth/status');
    if (signedIn) {
      window.location.replace(nextPath());
      return;
    }
  } catch {
    // Could not check. Show the form anyway.
  }

  const fields = [
    buildField({ name: 'email', label: 'Email', type: 'email', autocomplete: 'username', inputmode: 'email' }),
    buildField({ name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' }),
  ];
  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const button = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, icon('login'), 'Sign in');

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
          busyLabel: 'Signing in',
          onSubmit: async (values) => {
            await api('/auth/login', { method: 'POST', body: values });
            window.location.assign(nextPath());
          },
        });
      },
    },
    formError,
    fields.map((field) => field.wrapper),
    button,
  );

  $('#signin-form').replaceChildren(form);
  // Focus the email box on desktop only. On phones it would pop the keyboard open.
  if (window.matchMedia('(pointer: fine)').matches) fields[0].control.focus();
}

start();
