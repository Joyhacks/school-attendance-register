// The frame around every signed-in page: checks who is signed in,
// then builds the header and navigation for their role.
import { api } from './api.js';
import { h } from './dom.js';
import { toast } from './ui.js';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', key: 'dashboard' },
  { href: '/courses', label: 'Courses', key: 'courses' },
  { href: '/students', label: 'Students', key: 'students' },
  { href: '/staff', label: 'Staff accounts', key: 'staff', adminOnly: true },
  { href: '/account', label: 'My account', key: 'account' },
];

const ROLE_LABELS = { admin: 'Admin', lecturer: 'Lecturer' };

// Call at the top of every page script. Returns the signed-in user.
// If nobody is signed in, api() sends the browser to the sign-in page.
export async function initPage({ active, adminOnly = false }) {
  const [{ user }, meta] = await Promise.all([api('/auth/me'), api('/meta')]);
  if (adminOnly && user.role !== 'admin') {
    window.location.replace('/dashboard');
    return new Promise(() => {});
  }

  const nav = h('nav', { class: 'app-nav', id: 'app-nav', 'aria-label': 'Main' });
  const toggle = h(
    'button',
    {
      class: 'nav-toggle',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'app-nav',
      onclick: () => {
        const open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
      },
    },
    'Menu',
  );

  nav.append(
    h('ul', {}, NAV.filter((item) => !item.adminOnly || user.role === 'admin').map((item) =>
      h('li', {}, h('a', { href: item.href, 'aria-current': item.key === active ? 'page' : null }, item.label)),
    )),
    h(
      'div',
      { class: 'app-user' },
      h('div', { class: 'app-user__name' }, user.fullName),
      h('div', { class: 'app-user__role' }, ROLE_LABELS[user.role]),
      h('button', { type: 'button', onclick: signOut }, 'Sign out'),
    ),
  );

  const header = h(
    'header',
    { class: 'app-header' },
    h(
      'div',
      { class: 'app-header__bar' },
      h('a', { class: 'brand', href: '/dashboard' },
        h('span', { class: 'brand__school', translate: 'no' }, meta.schoolName),
        h('span', { class: 'brand__name' }, 'Attendance Register')),
      toggle,
    ),
    nav,
  );

  document.querySelector('.app').prepend(header);
  return user;
}

async function signOut() {
  try {
    await api('/auth/logout', { method: 'POST' });
    window.location.assign('/');
  } catch (error) {
    toast(error.message, { error: true });
  }
}

// Reads and writes values in the address bar, so filters, tabs and
// pages survive a refresh and can be shared as a link.
export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || '';
}

export function setParams(changes, { replace = true } = {}) {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(changes)) {
    if (value === '' || value === null || value === undefined) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
  }
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}
