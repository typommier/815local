// IP blocklist enforcement — runs on every page load.
// Fetches the visitor's public IP, checks it against the blocked_ips table,
// and renders an access-denied screen if matched. Fails open on network errors
// so legitimate users are never locked out by a flaky external IP API.
(async function () {
  const SUPABASE_URL = 'https://kyneaettrynagavewefi.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5bmVhZXR0cnluYWdhdmV3ZWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTQyNjYsImV4cCI6MjA5MjE5MDI2Nn0.M0II61ANo67dJk-8kz4VCkiwaI4uxdtIFsLI0aR0uZk';

  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    if (!ipRes.ok) return;
    const { ip } = await ipRes.json();
    if (!ip) return;

    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/blocked_ips?ip=eq.${encodeURIComponent(ip)}&select=ip&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!checkRes.ok) return;
    const matches = await checkRes.json();
    if (!matches || matches.length === 0) return;

    // Blocked — replace page content with denial notice
    document.documentElement.innerHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Access Denied – 815local</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{display:flex;align-items:center;justify-content:center;min-height:100vh;
               background:#f8f9fa;font-family:Arial,sans-serif;color:#333}
          .box{text-align:center;padding:48px 32px;max-width:480px}
          .icon{font-size:3rem;margin-bottom:16px}
          h1{font-size:1.5rem;margin-bottom:12px;color:#b00}
          p{line-height:1.6;color:#555}
        </style>
      </head>
      <body>
        <div class="box">
          <div class="icon">🚫</div>
          <h1>Access Denied</h1>
          <p>Your access to 815local has been revoked. If you believe this is an error, please contact us.</p>
        </div>
      </body>
      </html>`;
  } catch (_) {
    // Fail open — don't block legitimate users on API or network errors
  }
})();
