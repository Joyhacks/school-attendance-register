// Shared interface pieces: toasts, dialogs, tables and page states.
import { ApiError } from './api.js';
import { h, mount } from './dom.js';

let idCounter = 0;
const nextId = (prefix) => `${prefix}-${(idCounter += 1)}`;

// ---------- Toasts ----------

function toastRegion() {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  return region;
}

export function toast(message, { error = false } = {}) {
  // Tap or click a toast to dismiss it early.
  const item = h('div', { class: error ? 'toast toast--error' : 'toast', onclick: () => item.remove() }, message);
  toastRegion().append(item);
  setTimeout(() => item.remove(), error ? 7000 : 4000);
}

// ---------- Buttons ----------

// Runs an async action while the button shows a busy label. The busy
// flag also blocks a second click, so nothing is submitted twice.
export async function withBusy(button, busyLabel, action) {
  if (button.getAttribute('aria-busy') === 'true') return undefined;
  const label = button.textContent;
  button.setAttribute('aria-busy', 'true');
  button.textContent = busyLabel;
  try {
    return await action();
  } finally {
    button.removeAttribute('aria-busy');
    button.textContent = label;
  }
}

// ---------- Page states ----------

export function showLoading(container, label = 'Loading') {
  mount(
    container,
    h('div', { class: 'skeleton', role: 'status' }, h('span'), h('span'), h('span'), h('p', { class: 'visually-hidden' }, label)),
  );
}

export function showEmpty(container, { title, text, action }) {
  mount(container, h('div', { class: 'state' }, h('h2', {}, title), text ? h('p', {}, text) : null, action || null));
}

export function showError(container, error, retry) {
  mount(
    container,
    h(
      'div',
      { class: 'state state--error', role: 'alert' },
      h('h2', {}, 'This did not load'),
      h('p', {}, error?.message || 'Something went wrong.'),
      retry ? h('button', { class: 'btn btn--secondary', type: 'button', onclick: retry }, 'Try again') : null,
    ),
  );
}

// Loads data into a container with loading and error states handled.
export async function loadInto(container, loader, render) {
  showLoading(container);
  try {
    render(await loader());
  } catch (error) {
    showError(container, error, () => loadInto(container, loader, render));
  }
}

// ---------- Tables ----------

// columns: [{ label, cell(row) -> text or element, numeric, primary, actions }]
// rowClass(row) can return a class name for the whole row.
export function buildTable({ caption, columns, rows, rowClass }) {
  const head = h('tr', {}, columns.map((col) =>
    h('th', { scope: 'col', class: col.numeric ? 'is-num' : col.actions ? 'is-actions' : null },
      col.actions ? h('span', { class: 'visually-hidden' }, col.label) : col.label),
  ));
  const body = rows.map((row) =>
    h('tr', { class: rowClass ? rowClass(row) : null }, columns.map((col) => {
      const classes = [col.numeric && 'is-num', col.primary && 'is-primary table__primary', col.actions && 'is-actions'].filter(Boolean).join(' ');
      return h('td', { class: classes || null, 'data-label': col.label }, col.cell(row));
    })),
  );
  return h(
    'div',
    { class: 'table-wrap' },
    h('table', { class: 'table table--stack' }, h('caption', { class: 'visually-hidden' }, caption), h('thead', {}, head), h('tbody', {}, body)),
  );
}

// ---------- Dialogs ----------

function openDialog(dialog) {
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

// Asks the user to confirm. Resolves true or false.
export function confirmDialog({ title, text, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    const titleId = nextId('dialog-title');
    const dialog = h(
      'dialog',
      { class: 'dialog', 'aria-labelledby': titleId },
      h(
        'div',
        { class: 'dialog__body' },
        h('h2', { class: 'dialog__title', id: titleId }, title),
        h('p', { class: 'dialog__text' }, text),
        h(
          'div',
          { class: 'dialog__actions' },
          h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => dialog.close('cancel') }, 'Cancel'),
          h('button', { class: danger ? 'btn btn--danger' : 'btn btn--primary', type: 'button', onclick: () => dialog.close('confirm') }, confirmLabel),
        ),
      ),
    );
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'));
    openDialog(dialog);
  });
}

// Shows a simple read-only dialog with any content and a Close button.
export function infoDialog({ title, content, wide = false }) {
  const titleId = nextId('dialog-title');
  const dialog = h(
    'dialog',
    { class: wide ? 'dialog dialog--wide' : 'dialog', 'aria-labelledby': titleId },
    h(
      'div',
      { class: 'dialog__body' },
      h('h2', { class: 'dialog__title', id: titleId }, title),
      content,
      h('div', { class: 'dialog__actions' }, h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => dialog.close() }, 'Close')),
    ),
  );
  openDialog(dialog);
  return dialog;
}

function buildControl(field, id) {
  const common = { id, name: field.name, 'aria-describedby': `${id}-help ${id}-error` };
  if (field.type === 'select') {
    return h('select', { ...common, class: 'select' }, field.options.map((option) =>
      h('option', { value: option.value, selected: String(option.value) === String(field.value ?? '') }, option.label),
    ));
  }
  if (field.type === 'textarea') {
    return h('textarea', { ...common, class: 'textarea', rows: field.rows || 6, placeholder: field.placeholder, spellcheck: 'false' }, field.value || '');
  }
  return h('input', {
    ...common,
    class: 'input',
    type: field.type || 'text',
    value: field.value ?? '',
    placeholder: field.placeholder,
    autocomplete: field.autocomplete || 'off',
    inputmode: field.inputmode,
    min: field.min,
    max: field.max,
    list: field.datalist ? `${id}-list` : null,
    spellcheck: field.type === 'email' || field.type === 'password' ? 'false' : null,
    autocapitalize: field.type === 'email' ? 'none' : null,
  });
}

// Builds one labelled field. Returns the wrapper plus helpers to read
// the value and show or clear an error under it.
export function buildField(field) {
  const id = nextId('field');
  const control = buildControl(field, id);
  const error = h('p', { class: 'field__error', id: `${id}-error`, hidden: true });
  const wrapper = h(
    'div',
    { class: 'field' },
    h('label', { class: 'field__label', for: id }, field.label, field.required === false && !field.plainLabel ? h('span', { class: 'muted' }, ' (optional)') : null),
    control,
    field.datalist ? h('datalist', { id: `${id}-list` }, field.datalist.map((value) => h('option', { value }))) : null,
    h('p', { class: 'field__help', id: `${id}-help`, hidden: !field.help }, field.help || ''),
    error,
  );

  const setError = (message) => {
    error.textContent = message || '';
    error.hidden = !message;
    if (message) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  };
  const isMissing = () => field.required !== false && control.value.trim() === '';
  // Check when the user leaves the field. Once an error shows, re-check on every keystroke.
  control.addEventListener('blur', () => setError(isMissing() ? `${field.label} is required.` : ''));
  control.addEventListener('input', () => {
    if (!error.hidden && !isMissing()) setError('');
  });

  return { name: field.name, label: field.label, wrapper, control, setError, isMissing };
}

// Wires a set of fields to a submit handler: required checks, errors
// from the server placed beside their fields, focus on the first error.
// Returns true when onSubmit finished without an error.
export async function submitFields({ fields, formError, button, busyLabel, onSubmit }) {
  formError.hidden = true;
  let firstInvalid = null;
  for (const field of fields) {
    const missing = field.isMissing();
    field.setError(missing ? `${field.label} is required.` : '');
    if (missing && !firstInvalid) firstInvalid = field;
  }
  if (firstInvalid) {
    firstInvalid.control.focus();
    return false;
  }
  const values = Object.fromEntries(fields.map((field) => [field.name, field.control.value]));
  try {
    const result = await withBusy(button, busyLabel, () => onSubmit(values));
    return result === undefined ? true : result;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    let focused = false;
    for (const field of fields) {
      const message = error.fields?.[field.name];
      if (!message) continue;
      field.setError(message);
      if (!focused) {
        field.control.focus();
        focused = true;
      }
    }
    if (!focused) {
      formError.textContent = error.message;
      formError.hidden = false;
    }
    return false;
  }
}

// A dialog with a form in it. onSubmit(values) does the saving. The
// dialog closes when onSubmit succeeds. Resolves true if saved, false if cancelled.
export function formDialog({ title, intro, fields: fieldDefs, submitLabel, busyLabel = 'Saving', onSubmit, extra, wide = false }) {
  return new Promise((resolve) => {
    const titleId = nextId('dialog-title');
    const fields = fieldDefs.map(buildField);
    const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, submitLabel);
    let saved = false;

    const form = h(
      'form',
      {
        class: 'dialog__body',
        novalidate: true,
        onsubmit: async (event) => {
          event.preventDefault();
          const ok = await submitFields({ fields, formError, button: submit, busyLabel, onSubmit });
          if (ok) {
            saved = true;
            dialog.close();
          }
        },
      },
      h('h2', { class: 'dialog__title', id: titleId }, title),
      intro ? h('p', { class: 'dialog__text' }, intro) : null,
      formError,
      fields.map((field) => field.wrapper),
      extra || null,
      h(
        'div',
        { class: 'dialog__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => dialog.close() }, 'Cancel'),
        submit,
      ),
    );
    const dialog = h('dialog', { class: wide ? 'dialog dialog--wide' : 'dialog', 'aria-labelledby': titleId }, form);
    dialog.addEventListener('close', () => resolve(saved));
    openDialog(dialog);
  });
}
