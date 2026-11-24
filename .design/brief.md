# Design brief

Mode: product (an internal tool). Depth: quick pass. Not yet reviewed against reference shots or on a physical phone.

- Audience: lecturers marking a register in a lecture hall on a phone, and an admin at a desk.
- Primary action: Take attendance, then Save register.
- Concept: the paper class register. Rows of names, one mark each, a running tally at the foot.
- Defended decision: the marking screen is designed phone-first. Four full-width marks per student, "Mark the rest present" so only exceptions need a tap, and a sticky tally with one save button.
- Voice: plain classroom words. Register, class, mark, present, absent. No product-speak.

## Tokens (public/css/tokens.css)

- Canvas #f1f3f0, surface #ffffff, ink #151a21. Neutrals are tinted, no pure black or flat grey.
- One accent, biro blue #1e3a9a, for actions only.
- Mark colours: present #1a7442, absent #b42318, late #875400, excused #46546a. Every mark also carries its word, never colour alone.
- Type: Atkinson Hyperlegible Next, one family, bundled locally. Chosen because matric numbers need 0/O and 1/l told apart.
- Spacing on an 8px scale. Radius 6px for controls, 10px for panels. Edges, no shadows.

## Do not

- No gradients, glows, shadows, icon tiles or card grids.
- No second accent colour. Red is only for absent, below-minimum and destructive actions.
- No inline styles or inline scripts (the Content Security Policy blocks them).
- Tables keep the stacked layout on phones. Do not shrink them.
