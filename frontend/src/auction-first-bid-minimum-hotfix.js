/* Auction first-bid minimum fix.
   When an auction has no bids, the first valid bid is the starting bid itself.
   The fixed minimum increment only applies after at least one bid exists. */

function numberFromText(value) {
  const match = String(value || '').replace(/,/g, '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function setNativeInputValue(input, value) {
  const proto = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function patchAuctionModal(modal) {
  if (!modal || modal.dataset.firstBidMinimumPatched === 'true') return;
  const body = modal.textContent || '';
  const noBids = /No bids yet\./i.test(body);
  const startingMatch = body.match(/Starting bid:\s*([\d,]+)\s*IC/i);
  if (!noBids || !startingMatch) return;

  const startingBid = numberFromText(startingMatch[1]);
  if (!startingBid) return;

  modal.dataset.firstBidMinimumPatched = 'true';
  const input = modal.querySelector('.auction-clean-bid-panel input, input[inputmode="numeric"]');
  if (input) setNativeInputValue(input, startingBid);

  const small = modal.querySelector('.auction-clean-bid-panel small');
  if (small) small.textContent = `Minimum allowed: ${startingBid.toLocaleString()} IC. First bid can match the starting bid.`;
}

function scan() {
  document.querySelectorAll('.auction-clean-modal').forEach(patchAuctionModal);
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_FIRST_AUCTION_BID_FIX__) return;
  window.__VELKTRADE_FIRST_AUCTION_BID_FIX__ = true;
  const observer = new MutationObserver(() => window.requestAnimationFrame(scan));
  observer.observe(document.body, { childList: true, subtree: true });
  window.setInterval(scan, 700);
  window.setTimeout(scan, 300);
}

install();
