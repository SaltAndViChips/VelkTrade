const INVENTORY_BUTTON_ID = 'velktrade-topbar-inventory-button';

function buttonText(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function visible(node) {
  if (!node || !(node instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function findButtonByText(text) {
  const target = String(text).toLowerCase();
  return Array.from(document.querySelectorAll('button, a'))
    .find(node => visible(node) && buttonText(node) === target);
}

function clickDashboardThenInventory() {
  const inventoryTile = Array.from(document.querySelectorAll('button.dashboard-tile, .dashboard-menu button'))
    .find(node => buttonText(node) === 'my inventory');
  if (inventoryTile) {
    inventoryTile.click();
    return;
  }

  const dashboardButton = findButtonByText('dashboard');
  dashboardButton?.click();

  const started = Date.now();
  const timer = window.setInterval(() => {
    const tile = Array.from(document.querySelectorAll('button.dashboard-tile, .dashboard-menu button'))
      .find(node => buttonText(node) === 'my inventory');
    if (tile) {
      window.clearInterval(timer);
      tile.click();
      return;
    }
    if (Date.now() - started > 4000) window.clearInterval(timer);
  }, 100);
}

function createInventoryButton() {
  const button = document.createElement('button');
  button.id = INVENTORY_BUTTON_ID;
  button.type = 'button';
  button.className = 'velktrade-topbar-inventory-button';
  button.textContent = 'Inventory';
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    clickDashboardThenInventory();
  });
  return button;
}

function installInventoryButton() {
  if (document.getElementById(INVENTORY_BUTTON_ID)) return;

  const dashboardButton = findButtonByText('dashboard');
  const profileButton = findButtonByText('profile');
  const anchor = dashboardButton || profileButton;
  if (!anchor?.parentElement) return;

  const button = createInventoryButton();
  if (dashboardButton?.nextSibling) {
    dashboardButton.parentElement.insertBefore(button, dashboardButton.nextSibling);
  } else if (profileButton) {
    profileButton.parentElement.insertBefore(button, profileButton);
  } else {
    anchor.parentElement.appendChild(button);
  }
}

function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__VELKTRADE_TOPBAR_INVENTORY_BUTTON__) return;
  window.__VELKTRADE_TOPBAR_INVENTORY_BUTTON__ = true;

  window.setInterval(installInventoryButton, 800);
  window.addEventListener('focus', installInventoryButton);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') installInventoryButton();
  });
  window.setTimeout(installInventoryButton, 500);
  window.setTimeout(installInventoryButton, 1500);
}

install();
