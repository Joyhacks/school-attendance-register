# Design brief

Mode: product (an internal tool). Depth: quick pass. Not yet reviewed against reference shots or on a physical phone.

- Audience: lecturers marking a register in a lecture hall on a phone, and an admin at a desk.
- Primary action: Take attendance, then Save register.
- Concept: the paper class register. Rows of names, one mark each, a running tally at the foot.
- Defended decision: the marking screen is designed phone-first. Four full-width marks per student, "Mark the rest present" so only exceptions need a tap, and a sticky tally with one save button.
- Voice: plain classroom words. Register, class, mark, present, absent. No product-speak.

## Tokens (public/css/tokens.css)

Measured from bestpotech.edu.ng on 24 Nov 2026:
- Green #2a7d2e (actions, active nav), deep green #0f3d16 (sidebar, portal panel), #1a5020 (strong text on light green), bright #16cb00 (the 56x3px rule under headings).
- Gold #f59e0b on dark, #b45309 for small text on light (section eyebrows, the active-nav marker).
- Slate text: headings #0f172a, body #374151, secondary #576173 (darkened from the site's #64748b to pass 4.5:1 on the page background). Borders #e2e8f0.
- Montserrat 600/700 for headings, buttons, tabs and table headers (uppercase, tracked, like the site's nav and buttons). Roboto 400/500/700 for everything else.
- 4px control radius, 8px panels, one light shadow.
- Mark colours: present #1f7a33, absent #c0392b, late #b45309, excused #475569. Every mark also carries its word.

## Patterns taken from the school site

- Gold uppercase eyebrow, Montserrat title, short bright-green rule: every page header.
- Uppercase Montserrat buttons with a leading icon.
- Progress bars like the site's "Practical Knowledge 95%" bars: attendance rates.
- Crest beside the school name in green; motto in italics.

## Do not

- No gradients, glows, glass or decorative blobs.
- Red only for absent, below-minimum and destructive actions. Gold only for labels, the low-attendance bar and the minimum line.
- No inline styles or inline scripts (the Content Security Policy blocks them). Widths set from JS go through element.style.
- Tables keep the stacked layout on phones. Do not shrink them.
- Keep the project note on every page while the crest is used.
