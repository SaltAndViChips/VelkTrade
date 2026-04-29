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

function trimChatMessage(message) {
  return String(message || '').trim().slice(0, 500);
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
    expect(canSaltAdmin('Other')).toBe(false);
  });

  it('trims chat and limits length', () => {
    expect(trimChatMessage(`  ${'a'.repeat(700)}  `)).toHaveLength(500);
  });
});
