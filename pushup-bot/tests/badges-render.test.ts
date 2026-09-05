import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BADGES } from '../src/domain/badges.ts';
import { renderBadgeCard, type BadgeCardRow } from '../src/render/badges.ts';
import { topBadges } from '../src/render/view.ts';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test('на борде показываются самые ценные бейджи', () => {
  const codes = ['streak_3', 'streak_7', 'streak_10', 'streak_14', 'finisher', 'loser'] as const;
  // Итог челленджа первым, дальше — самые длинные серии.
  assert.deepEqual(topBadges([...codes]), ['finisher', 'streak_14', 'streak_10']);
  assert.deepEqual(topBadges(['streak_3']), ['streak_3']);
  assert.deepEqual(topBadges([]), []);
  assert.equal(topBadges([...codes], 2).length, 2);
});

test('витрина бейджей рисуется в PNG', () => {
  const rows: BadgeCardRow[] = BADGES.map((meta, index) => ({
    code: meta.code,
    earned: index < 3,
    note: index < 3 ? '08.09.2026' : 'ещё 2 дня',
  }));
  const png = renderBadgeCard({ name: 'Vlad', earnedCount: 3, total: rows.length, streak: 5, best: 12, rows });
  assert.ok(png.length > 5000);
  assert.deepEqual(png.subarray(0, 4), PNG_MAGIC);
});
