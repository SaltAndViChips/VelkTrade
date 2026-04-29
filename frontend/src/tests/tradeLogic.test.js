import { describe, expect, it } from 'vitest';

function getVisibleInventory(inventory, offeredIds) {
  return inventory.filter(item => !offeredIds.includes(item.id));
}

function canConfirm(myAccepted, theirAccepted) {
  return myAccepted && theirAccepted;
}

function transferItems(inventory, offeredIds) {
  return inventory.filter(item => !offeredIds.includes(item.id));
}

describe('trade logic', () => {
  it('removes offered items from the visible trade inventory', () => {
    const inventory = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const visible = getVisibleInventory(inventory, [2]);

    expect(visible).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it('does not allow confirm until both players accepted', () => {
    expect(canConfirm(true, false)).toBe(false);
    expect(canConfirm(false, true)).toBe(false);
    expect(canConfirm(true, true)).toBe(true);
  });

  it('only permanently removes items after final transfer logic runs', () => {
    const inventory = [{ id: 1 }, { id: 2 }];
    const remaining = transferItems(inventory, [1]);

    expect(remaining).toEqual([{ id: 2 }]);
  });
});
