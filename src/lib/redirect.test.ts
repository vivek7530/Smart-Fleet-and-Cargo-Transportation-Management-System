import assert from 'node:assert/strict';
import test from 'node:test';
import { safeInternalPath } from './redirect';

test('an ordinary internal path is kept, query string and all', () => {
  assert.equal(safeInternalPath('/trips'), '/trips');
  assert.equal(safeInternalPath('/trips?stale=true'), '/trips?stale=true');
  assert.equal(safeInternalPath('/trips/652f?tab=costs#notes'), '/trips/652f?tab=costs#notes');
});

test('nothing at all falls back to the dashboard', () => {
  assert.equal(safeInternalPath(null), '/dashboard');
  assert.equal(safeInternalPath(undefined), '/dashboard');
  assert.equal(safeInternalPath(''), '/dashboard');
  assert.equal(safeInternalPath('/trips', '/my-trips'), '/trips');
  assert.equal(safeInternalPath(null, '/my-trips'), '/my-trips');
});

test('another origin is refused, however it is dressed up', () => {
  for (const hostile of [
    'https://evil.example',
    'http://evil.example/trips',
    '//evil.example',
    '//evil.example/trips',
    '/\\evil.example',
    'javascript:alert(1)',
    'evil.example',
  ]) {
    assert.equal(safeInternalPath(hostile), '/dashboard', hostile);
  }
});

test('control characters are refused', () => {
  assert.equal(safeInternalPath('/trips\nSet-Cookie: x=1'), '/dashboard');
  assert.equal(safeInternalPath('/trips\u0000'), '/dashboard');
});

test('the auth pages are refused, so signing in cannot loop', () => {
  assert.equal(safeInternalPath('/login'), '/dashboard');
  assert.equal(safeInternalPath('/login?next=%2Flogin'), '/dashboard');
  assert.equal(safeInternalPath('/register'), '/dashboard');
  // A path that merely begins with those letters is a real page.
  assert.equal(safeInternalPath('/login-history'), '/login-history');
});
