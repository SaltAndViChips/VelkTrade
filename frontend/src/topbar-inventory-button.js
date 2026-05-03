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
  if (inventoryTile) return inventoryTile.click();

  findButtonByText('dashboard')?.click();
  const started = Date.now();
  const timer = window.setInterval(() => {
    const tile = Array.from(document.querySelectorAll('button.dashboard-tile, .dashboard-menu button'))
      .find(node => buttonText(node) === 'my inventory');
    if (tile) {
      window.clearInterval(timer);
      tile.click();
    }
    if (Date.now() - started > 4000) window.clearInterval(timer);
  }, 100);
}

function applyMatchingButtonClass(button, source) {
  if (!source) return;
  button.className = `${source.className || ''} velktrade-topbar-inventory-button`.trim();
  button.setAttribute('style', source.getAttribute('style') || '');
}

function createInventoryButton(source) {
  const button = document.createElement('button');
  button.id = INVENTORY_BUTTON_ID;
  button.type = 'button';
  button.textContent = 'Inventory';
  applyMatchingButtonClass(button, source);
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    clickDashboardThenInventory();
  });
  return button;
}

function installInventoryButton() {
  const dashboardButton = findButtonByText('dashboard');
  const profileButton = findButtonByText('profile');
  const anchor = dashboardButton || profileButton;
  const existing = document.getElementById(INVENTORY_BUTTON_ID);

  if (existing && anchor) {
    applyMatchingButtonClass(existing, anchor);
    return;
  }
  if (existing || !anchor?.parentElement) return;

  const button = createInventoryButton(anchor);
  if (dashboardButton?.nextSibling) dashboardButton.parentElement.insertBefore(button, dashboardButton.nextSibling);
  else if (profileButton) profileButton.parentElement.insertBefore(button, profileButton);
  else anchor.parentElement.appendChild(button);
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
  window.setTimeout(installInventoryButton, 200);
  window.setTimeout(installInventoryButton, 900);
  window.setTimeout(installInventoryButton, 1800);
}

install();
