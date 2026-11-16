import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRange } from './reports.service';

const indiaDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);

test('today report range uses India calendar-day boundaries', () => {
  const range = resolveRange('today');
  const today = indiaDate(new Date());
  assert.equal(indiaDate(range.from), today);
  assert.equal(indiaDate(range.to), today);
  assert.equal(range.from.getTime() % 60_000, 0);
  assert.equal(range.to.getTime() - range.from.getTime(), 86_399_999);
});

test('custom report range includes the complete selected days in India time', () => {
  const range = resolveRange('custom', '2026-11-01', '2026-11-03');
  assert.equal(indiaDate(range.from), '2026-11-01');
  assert.equal(indiaDate(range.to), '2026-11-03');
  assert.equal(range.to.getTime() - range.from.getTime(), 3 * 86_400_000 - 1);
});
