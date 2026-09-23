// lib/automation/handlers/auth-page.test.js — oauthDonePage escaping
// The OAuth callback is public and echoes ?error= into this page on the app's own
// origin; unescaped, that was a one-click XSS riding the viewer's session cookie.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { oauthDonePage } from './auth.js';

describe('oauthDonePage', () => {
  it('escapes markup in the message', () => {
    const html = oauthDonePage('Google auth failed: <img src=x onerror="alert(1)">', false);
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  });

  it('escapes an array-valued error (?error=a&error=b)', () => {
    const html = oauthDonePage(`Dropbox auth failed: ${['<script>x</script>', 'b']}`, false);
    assert.ok(!html.includes('<script>x'));
  });

  it('only ever emits a boolean into the inline script', () => {
    const html = oauthDonePage('ok', '1});alert(1);//');
    assert.match(html, /success:false\}/);
  });

  it('keeps plain success text intact', () => {
    assert.ok(oauthDonePage('Google Drive connected!', true).includes('<p>Google Drive connected!</p>'));
  });
});
