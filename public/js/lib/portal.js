// Fills the school panel on the sign-in and setup pages.
import { api } from './api.js';
import { $ } from './dom.js';
import { icon } from './icons.js';

export async function fillSchoolPanel(pageTitle) {
  try {
    const meta = await api('/meta');
    $('#school-name').textContent = meta.schoolName;
    document.title = `${pageTitle} | ${meta.schoolName} Attendance Register`;
    if (meta.schoolMotto) {
      $('#school-motto').textContent = meta.schoolMotto;
      $('#school-motto').hidden = false;
    }
    if (meta.schoolAddress) {
      $('#school-address').replaceChildren(icon('mapPin', { size: 16 }), meta.schoolAddress);
      $('#school-address').hidden = false;
    }
    if (meta.projectNote) {
      $('#project-note').textContent = meta.projectNote;
      $('#project-note').hidden = false;
    }
  } catch {
    // The page still works without the school details.
  }
}
