import { describe, expect, it } from 'vitest';

function getVisibleInventory(inventory, offeredIds) {
  return inventory.filter(item => !offeredIds.includes(item.id));
}

function canConfirm(myAccepted, theirAccepted) {
  return myAccepted && theirAccepted;
}

function canSaltAdmin(username) {
  return String(username || '').trim().toLowerCase() === 'salt';
}

function cleanImgurTitle(title, fallback) {
  const raw = String(title || '').trim();
  if (!raw) return fallback;
  if (raw.includes('|')) {
    const afterPipe = raw.split('|').pop().trim();
    if (afterPipe) return afterPipe;
  }
  return raw;
}

describe('trade logic', () => {
  it('removes offered items from visible inventory', () => {
    expect(getVisibleInventory([{ id: 1 }, { id: 2 }], [2])).toEqual([{ id: 1 }]);
  });

  it('requires both accepts before confirm', () => {
    expect(canConfirm(true, false)).toBe(false);
    expect(canConfirm(true, true)).toBe(true);
  });

  it('allows Salt admin regardless of case/spacing', () => {
    expect(canSaltAdmin('Salt')).toBe(true);
    expect(canSaltAdmin(' salt ')).toBe(true);
    expect(canSaltAdmin('SALT')).toBe(true);
    expect(canSaltAdmin('Other')).toBe(false);
  });

  it('cleans Imgur marketing prefixes from titles', () => {
    expect(cleanImgurTitle('discord.gg/velkon | Apocalyptic SR-25', '6hUs12E')).toBe('Apocalyptic SR-25');
  });
});
