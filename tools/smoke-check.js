const assert = require('node:assert/strict');

const baseUrl = process.env.RESTROFLOW_URL || 'https://restro-6bf9c.web.app';
const pages = ['/', '/admin.html', '/platform-admin.html', '/privacy.html', '/terms.html', '/refund-policy.html'];

(async () => {
  for (const page of pages) {
    const response = await fetch(`${baseUrl}${page}`);
    assert.equal(response.status, 200, `${page} returned ${response.status}`);
    const html = await response.text();
    assert.ok(html.includes('<html'), `${page} is not HTML`);
  }
  console.log(`Smoke check passed: ${pages.length} pages reachable at ${baseUrl}`);
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
