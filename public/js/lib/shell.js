// The frame around every signed-in page: checks who is signed in,
// then builds the school header and navigation for their role.
import { api } from './api.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { avatar, toast } from './ui.js';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', key: 'dashboard', icon: 'dashboard' },
  { href: '/courses', label: 'Courses', key: 'courses', icon: 'courses' },
  { href: '/students', label: 'Students', key: 'students', icon: 'students' },
  { href: '/staff', label: 'Staff accounts', key: 'staff', icon: 'staff', adminOnly: true },
  { href: '/account', label: 'My account', key: 'account', icon: 'account' },
];

const ROLE_LABELS = { admin: 'Administrator', lecturer: 'Lecturer' };

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
      'aria-label': 'Menu',
      onclick: () => {
        const open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.replaceChildren(icon(open ? 'close' : 'menu'));
      },
    },
    icon('menu'),
  );

  nav.append(
    h('p', { class: 'app-nav__label' }, 'Menu'),
    h('ul', {}, NAV.filter((item) => !item.adminOnly || user.role === 'admin').map((item) =>
      h('li', {}, h('a', { href: item.href, 'aria-current': item.key === active ? 'page' : null }, icon(item.icon), item.label)),
    )),
    h(
      'div',
      { class: 'app-user' },
      h(
        'div',
        { class: 'app-user__row' },
        avatar(user.fullName, 'deep'),
        h('div', { class: 'app-user__text' }, h('div', { class: 'app-user__name' }, user.fullName), h('div', { class: 'app-user__role' }, ROLE_LABELS[user.role])),
        h('button', { class: 'signout', type: 'button', 'aria-label': 'Sign out', title: 'Sign out', onclick: signOut }, icon('logout')),
      ),
      meta.projectNote ? h('p', { class: 'project-note' }, meta.projectNote) : null,
    ),
  );

  const header = h(
    'header',
    { class: 'app-header' },
    h(
      'div',
      { class: 'app-header__bar' },
      h(
        'a',
        { class: 'brand', href: '/dashboard' },
        h('img', { class: 'brand__crest', src: '/img/crest-96.png', alt: '', width: 44, height: 44 }),
        h('span', { class: 'brand__text' }, h('span', { class: 'brand__school', translate: 'no' }, meta.schoolName), h('span', { class: 'brand__name' }, 'Attendance Register')),
      ),
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
