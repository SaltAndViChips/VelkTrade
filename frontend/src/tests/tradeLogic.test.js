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

function isJunkTitleLine(line) {
  const value = String(line || '').trim();
  const lower = value.toLowerCase();

  if (!value) return true;
  if (lower.includes('discord.gg')) return true;
  if (lower.includes('steamcommunity')) return true;
  if (lower.includes('steam_')) return true;
  if (lower.includes('owned-by-')) return true;
  if (lower.includes('owned by ')) return true;
  if (lower.includes('captured on')) return true;
  if (lower.includes('join http')) return true;
  if (lower.includes('http://')) return true;
  if (lower.includes('https://')) return true;

  return false;
}

function cleanImgurTitle(title, fallback) {
  const raw = String(title || '')
    .replace(/&amp;/g, '&')
    .replace(/amp;/g, '')
    .replace(/\s*-\s*Imgur\s*$/i, '')
    .trim();

  if (!raw) return fallback;

  if (raw.includes('|')) {
    const afterPipe = raw.split('|').pop().trim();
    if (afterPipe && !isJunkTitleLine(afterPipe)) return afterPipe;
  }

  const candidates = raw
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => !isJunkTitleLine(line));

  if (candidates.length > 0) return candidates[0];

  return isJunkTitleLine(raw) ? fallback : raw;
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

  it('cleans Imgur gallery title with discord prefix', () => {
    expect(cleanImgurTitle('discord.gg/velkon | Apocalyptic SR-25', '6hUs12E')).toBe('Apocalyptic SR-25');
  });

  it('finds item name from noisy Steam capture metadata', () => {
    const noisyTitle = `
Owned-by-Salt-amp-Vi-STEAM-0-1-108432244-https-steamcommunity-com-profiles-76561198177130217-Captured-on-Gaming-2-Join-http-l
Owned-by-Salt-amp-Vi-STEAM-0-1-108432244-https-steamcommunity-com-profiles-76561198177130217-Captured-on-Gaming-2-Join-http-l
Apocalyptic SR-25
Owned by Salt & Vi- (STEAM_0:1:108432244) (https://steamcommunity.com/profiles/76561198177130217)
Captured on ?★▶ Velkon Gaming #2
`;
    expect(cleanImgurTitle(noisyTitle, '6hUs12E')).toBe('Apocalyptic SR-25');
  });
});
