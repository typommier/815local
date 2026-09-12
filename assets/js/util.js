// Shared front-end utilities for 815local.
(function (global) {
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#39;');
  }

  function slugifyBiz(name, city) {
    var base = String(name || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    var town = String(city || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return town ? base + '-' + town : base;
  }

  function bizPath(b) {
    if (!b) return '/pages/directory.html';
    if (b.id && b.name) return '/b/' + slugifyBiz(b.name, b.city);
    if (b.id) return '/pages/business.html?id=' + encodeURIComponent(b.id);
    return '/pages/directory.html';
  }

  global.escapeHtml = escapeHtml;
  global.slugifyBiz = slugifyBiz;
  global.bizPath = bizPath;
})(typeof window !== 'undefined' ? window : this);
