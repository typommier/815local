// Shared front-end utilities for 815local.
//
// escapeHtml: make user-submitted strings safe to interpolate into innerHTML.
// Use this around any value that originates from the database (business names,
// descriptions, reviews, event/deal text, profile fields, etc.) before it is
// placed into a template literal that gets assigned to innerHTML.
(function (global) {
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  global.escapeHtml = escapeHtml;
})(typeof window !== 'undefined' ? window : this);
