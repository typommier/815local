/* Blocks honeypot submissions and keeps notify calls on-origin. */
(function () {
  var old = 'https://kyneaettrynagavewefi.supabase.co/functions/v1/notify-submission';
  var orig = window.fetch;
  if (typeof orig === 'function') {
    window.fetch = function (input, init) {
      if (typeof input === 'string' && input.indexOf(old) === 0) input = '/api/notify-submission';
      else if (input && typeof input.url === 'string' && input.url.indexOf(old) === 0) {
        input = new Request('/api/notify-submission', input);
      }
      return orig.call(this, input, init);
    };
  }
})();
