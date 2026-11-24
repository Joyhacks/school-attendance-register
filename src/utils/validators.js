// Small validation helpers. Every value that comes from the browser
// goes through these before it reaches the database.
import { invalid, notFound } from './httpError.js';

export const ATTENDANCE_STATUSES = Object.freeze(['present', 'absent', 'late', 'excused']);
export const ROLES = Object.freeze(['admin', 'lecturer']);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Each rule returns { value } when the input is fine or { error } when not.
export const rules = {
  text({ min = 1, max = 255, label = 'This field' } = {}) {
    return (raw) => {
      if (typeof raw !== 'string') return { error: `${label} is required.` };
      const value = raw.trim().replace(/\s+/g, ' ');
      if (value.length < min) return { error: min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.` };
      if (value.length > max) return { error: `${label} must be ${max} characters or fewer.` };
      return { value };
    };
  },

  optionalText({ max = 255, label = 'This field' } = {}) {
    return (raw) => {
      if (raw === undefined || raw === null || raw === '') return { value: null };
      if (typeof raw !== 'string') return { error: `${label} must be text.` };
      const value = raw.trim().replace(/\s+/g, ' ');
      if (value.length > max) return { error: `${label} must be ${max} characters or fewer.` };
      return { value: value || null };
    };
  },

  email() {
    return (raw) => {
      if (typeof raw !== 'string') return { error: 'Email is required.' };
      const value = raw.trim().toLowerCase();
      if (!value) return { error: 'Email is required.' };
      if (value.length > 190 || !EMAIL_PATTERN.test(value)) return { error: 'Enter a valid email address, like name@school.edu.' };
      return { value };
    };
  },

  // bcrypt only reads the first 72 bytes, so longer passwords are refused.
  password({ label = 'Password' } = {}) {
    return (raw) => {
      if (typeof raw !== 'string' || raw.length === 0) return { error: `${label} is required.` };
      if (raw.length < 8) return { error: `${label} must be at least 8 characters.` };
      if (Buffer.byteLength(raw, 'utf8') > 72) return { error: `${label} must be 72 characters or fewer.` };
      return { value: raw };
    };
  },

  integer({ min = 1, max = 2147483647, label = 'This field' } = {}) {
    return (raw) => {
      const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (typeof value !== 'number' || !Number.isInteger(value)) return { error: `${label} must be a whole number.` };
      if (value < min || value > max) return { error: `${label} must be between ${min} and ${max}.` };
      return { value };
    };
  },

  optionalId({ label = 'This field' } = {}) {
    return (raw) => {
      if (raw === undefined || raw === null || raw === '') return { value: null };
      return rules.integer({ label })(raw);
    };
  },

  oneOf(options, { label = 'This field' } = {}) {
    return (raw) => (options.includes(raw) ? { value: raw } : { error: `${label} must be one of: ${options.join(', ')}.` });
  },

  boolean({ label = 'This field' } = {}) {
    return (raw) => (typeof raw === 'boolean' ? { value: raw } : { error: `${label} must be true or false.` });
  },

  // A real calendar date in YYYY-MM-DD form. Rejects 2026-02-31.
  date({ label = 'Date' } = {}) {
    return (raw) => {
      if (typeof raw !== 'string' || !DATE_PATTERN.test(raw)) return { error: `${label} must look like 2026-11-24.` };
      const parsed = new Date(`${raw}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) return { error: `${label} is not a real date.` };
      return { value: raw };
    };
  },
};

// Checks an object against a map of rules. Only fields named in the
// schema come back, so extra fields from the browser are dropped.
// With partial: true, fields that were not sent are skipped (for edits).
export function validate(input, schema, { partial = false } = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const clean = {};
  const errors = {};
  for (const [field, rule] of Object.entries(schema)) {
    if (partial && source[field] === undefined) continue;
    const result = rule(source[field]);
    if (result.error) errors[field] = result.error;
    else clean[field] = result.value;
  }
  if (Object.keys(errors).length > 0) throw invalid(errors);
  return clean;
}

// Reads a numeric id from the URL. A bad id is treated as "not found".
export function parseId(raw, what = 'Record') {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw notFound(what);
  return id;
}

// Escapes % and _ so a search for "100%" is not treated as a wildcard.
export function likeTerm(term) {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
