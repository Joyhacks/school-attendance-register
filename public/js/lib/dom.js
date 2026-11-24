// Builds DOM elements without innerHTML, so text from the database
// can never be run as HTML.
//
//   h('a', { class: 'btn', href: '/courses' }, 'Courses')
//
// Attributes starting with "on" are event listeners. false, null and
// undefined attributes are skipped. Children can be text, elements or arrays.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    if (name.startsWith('on') && typeof value === 'function') {
      el.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (name === 'class') {
      el.className = value;
    } else if (name === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (value === true) {
      el.setAttribute(name, '');
    } else {
      el.setAttribute(name, String(value));
    }
  }
  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export const $ = (selector, root = document) => root.querySelector(selector);
