import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { velkToast } from '../velktrade-feature-foundation.js';

const SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'interest', label: 'Most Interest' },
  { key: 'highest', label: 'Highest Cost' },
  { key: 'lowest', label: 'Lowest Cost' }
];

const VERIFIED_FILTERS = [
  { key: 'all', label: 'All Users' },
  { key: 'verified', label: 'Verified' },
  { key: 'nonverified', label: 'Non-Verified' }
];

const AUCTION_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'recent', label: 'Recently Ended' },
  { key: 'history', label: 'History' }
];

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return value.title || value.name || value.username || fallback;
  return fallback;
}

function numberOnly(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function num(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '0';
}

function formatIc(value) {
  return `${formatNumber(value)} IC`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unknown time';
}

function isVerifiedUser(user) {
  return Boolean(user?.isVerified || user?.is_verified || user?.verified || user?.isTrusted || user?.is_trusted || user?.isAdmin || user?.is_admin);
}

function isEndedAuction(auction) {
  return ['completed', 'no_winner', 'bought_out', 'ended'].includes(String(auction?.status || '').toLowerCase());
}

function bidCount(auction) {
  return Number(auction?.bidCount || auction?.bid_count || 0);
}

function currentBid(auction) {
  return num(auction?.currentBid ?? auction?.current_bid ?? auction?.winningBid ?? auction?.startingBid ?? auction?.starting_bid);
}

function startingBid(auction) {
  return num(auction?.startingBid ?? auction?.starting_bid);
}

function buyoutPrice(auction) {
  return num(auction?.buyoutPrice ?? auction?.buyout_price);
}

function minIncrement(auction) {
  return num(auction?.minIncrement ?? auction?.min_increment, 0);
}

function bidLabel(auction) {
  return bidCount(auction) > 0 || auction?.hasBids ? 'Current bid' : 'Starting bid';
}

function minimumBid(auction) {
  const increment = minIncrement(auction);
  return currentBid(auction) + (increment > 0 ? increment : 1);
}

function suggestedBid(auction) {
  const increment = minIncrement(auction);
  const current = currentBid(auction);
  return increment > 0 ? current + increment : Math.max(current + 1, Math.ceil(current * 1.1));
}

function itemPrice(item) {
  const amount = formatNumber(item.priceAmount ?? item.price_amount ?? item.price);
  return amount && amount !== '0' ? `${amount} IC` : text(item.price, '');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function currentFilters({ search, sort, verified, min, max, minInterest }) {
  return { search, sort, verified, min, max, minInterest };
}

function filterSummary(filters = {}) {
  const parts = [];
  if (filters.search) parts.push(`Search: ${filters.search}`);
  if (filters.sort && filters.sort !== 'newest') parts.push(SORTS.find(sort => sort.key === filters.sort)?.label || filters.sort);
  if (filters.verified && filters.verified !== 'all') parts.push(VERIFIED_FILTERS.find(filter => filter.key === filters.verified)?.label || filters.verified);
  if (filters.min) parts.push(`Min ${filters.min} IC`);
  if (filters.max) parts.push(`Max ${filters.max} IC`);
  if (filters.minInterest) parts.push(`${filters.minInterest}+ interested`);
  return parts.length ? parts.join(' · ') : 'No extra filters';
}

function BazaarListingCard({ item, currentUser }) {
  const [hovered, setHovered] = useState(false);
  const title = text(item.title, 'Item');
  const image = text(item.image);
  const price = itemPrice(item);
  const shownTitle = hovered && price ? price : title;

  return (
    <article
      className={`inventory-mosaic-item bazaar-mosaic-item item-card vt-unified-item-card ${hovered && price ? 'vt-hover-price-title' : ''}`}
      data-item-id={item.id || ''}
      data-id={item.id || ''}
      data-title={title}
      data-vt-original-title={title}
      data-price={price}
      data-vt-price={price}
      data-vt-react-hover="true"
      data-vt-hover-swap-bound="true"
      data-owner-id={item.ownerId || item.owner_id || item.userId || item.userid || ''}
      data-owner-username={item.ownerUsername || ''}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div className="inventory-mosaic-image-frame bazaar-mosaic-image-frame">
        {image ? <img src={image} alt={title} draggable="false" /> : <div className="inventory-mosaic-placeholder">?</div>}
      </div>
      <span className="item-title inventory-mosaic-title">{shownTitle}</span>
      <div className="bazaar-mosaic-meta">
        {currentUser?.isAdmin && item.ownerUsername && (
          <span>Owner: <strong>{item.ownerUsername}</strong>{item.ownerVerified && <span className="verified-badge mini">✓</span>}</span>
        )}
        {item.ownerVerified && !currentUser?.isAdmin && <span><span className="verified-badge mini">✓</span> Verified seller</span>}
        <span>{Number(item.interestCount || 0)} verified interested</span>
        {item.viewerInterested && <span className="status-pill bazaar-watch-pill">you are interested</span>}
      </div>
    </article>
  );
}

function AuctionCard({ auction, onOpen, preview = false }) {
  const title = text(auction.title, 'Auction Item');
  const image = text(auction.image);
  const current = currentBid(auction);
  const buyout = buyoutPrice(auction);
  const increment = minIncrement(auction);
  const ended = isEndedAuction(auction);

  return (
    <article
      className={`auction-clean-card ${preview ? 'preview' : ''}`}
      data-auction-id={preview ? undefined : auction.id}
      onClick={preview ? undefined : event => {
        event.preventDefault();
        event.stopPropagation();
        onOpen(auction);
      }}
      role={preview ? undefined : 'button'}
      tabIndex={preview ? undefined : 0}
      onKeyDown={preview ? undefined : event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(auction);
        }
      }}
    >
      <div className="auction-clean-image-frame">
        {image ? <img src={image} alt={title} draggable="false" /> : <div className="inventory-mosaic-placeholder">?</div>}
      </div>
      <div className="auction-clean-body">
        <strong className="auction-clean-title">{title}</strong>
        <span><b>{bidLabel(auction)}:</b> {formatIc(current)}</span>
        <span><b>Buyout:</b> {buyout > 0 ? formatIc(buyout) : 'None'}</span>
        <span><b>Bid increment:</b> {increment > 0 ? formatIc(increment) : 'No fixed increment'}</span>
        <span><b>Bids:</b> {bidCount(auction)}</span>
        {!ended && <span className="auction-clean-hidden-seller">Seller hidden until ended</span>}
        {ended && (
          <>
            <span><b>Seller:</b> {auction.sellerUsername || 'Unknown'}</span>
            <span><b>Winner:</b> {auction.winnerUsername || 'No winner'}</span>
            <span><b>Final:</b> {formatIc(current)}</span>
          </>
        )}
      </div>
    </article>
  );
}

function AuctionModal({ auction, bids, bidAmount, setBidAmount, currentUser, onClose, onBid, onBuyout, onEnd, onDelete }) {
  if (!auction) return null;

  const canBid = isVerifiedUser(currentUser) && !auction.viewerIsSeller && auction.status === 'active';
  const canManage = Boolean(auction.viewerCanManage && auction.status === 'active');
  const canDelete = Boolean(auction.viewerCanManage || currentUser?.isAdmin || currentUser?.is_admin);
  const ended = isEndedAuction(auction);
  const current = currentBid(auction);
  const buyout = buyoutPrice(auction);
  const increment = minIncrement(auction);
  const minimum = minimumBid(auction);
  const suggested = suggestedBid(auction);
  const uniqueBidders = Array.from(new Map(bids.map(bid => [String(bid.bidderId), bid])).values());
  const [winnerId, setWinnerId] = useState('');

  useEffect(() => {
    setBidAmount(String(suggested));
    setWinnerId('');
  }, [auction?.id]);

  return (
    <div className="auction-clean-modal-backdrop" onMouseDown={onClose}>
      <section className="auction-clean-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="auction-clean-close" onClick={onClose}>×</button>
        <header className="auction-clean-modal-header">
          <div>
            <h2>{auction.title}</h2>
            <p className="muted">
              {bidLabel(auction)}: <strong>{formatIc(current)}</strong>
              {increment > 0 ? ` · Fixed increment: ${formatIc(increment)}` : ' · No fixed increment'}
            </p>
          </div>
          {buyout > 0 && <span className="auction-clean-buyout-pill">Buyout {formatIc(buyout)}</span>}
        </header>

        <div className="auction-clean-modal-grid">
          <div className="auction-clean-modal-image">
            {auction.image ? <img src={auction.image} alt={auction.title} /> : <div className="inventory-mosaic-placeholder">?</div>}
          </div>

          <div className="auction-clean-modal-side">
            <section className="auction-clean-panel">
              <h3>Bid History</h3>
              {bids.length === 0 ? (
                <p className="muted">No bids yet.</p>
              ) : (
                <div className="auction-clean-table-wrap">
                  <table>
                    <thead>
                      <tr><th>Bidder</th><th>Price</th><th>Date / Time</th></tr>
                    </thead>
                    <tbody>
                      {bids.map(bid => (
                        <tr key={bid.id}>
                          <td>{bid.bidderUsername || 'Unknown'}{bid.bidderVerified && <span className="verified-badge mini">✓</span>}</td>
                          <td>{formatIc(bid.amount)}</td>
                          <td>{formatDateTime(bid.createdAt || bid.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {canBid && (
              <section className="auction-clean-panel auction-clean-bid-panel">
                <label>
                  <span>Your bid</span>
                  <input value={bidAmount} onChange={event => setBidAmount(numberOnly(event.target.value))} inputMode="numeric" placeholder={String(suggested)} />
                  <small>{increment > 0 ? `Minimum allowed: ${formatIc(minimum)}` : `Minimum allowed: ${formatIc(minimum)}. The default value is only a +10% suggestion.`}</small>
                </label>
                <button type="button" onClick={() => onBid(auction, bidAmount || suggested)}>Place bid</button>
                {buyout > 0 && <button type="button" className="ghost" onClick={() => onBuyout(auction)}>Offer buyout</button>}
              </section>
            )}

            {ended && (
              <section className="auction-clean-panel">
                <h3>Result</h3>
                <p><strong>Seller:</strong> {auction.sellerUsername || 'Unknown'}</p>
                <p><strong>Winner:</strong> {auction.winnerUsername || 'No winner'}</p>
                <p><strong>Winning bid:</strong> {formatIc(current)}</p>
              </section>
            )}

            {canManage && (
              <section className="auction-clean-panel auction-clean-owner-panel">
                <h3>Seller Controls</h3>
                <label>
                  <span>Winner</span>
                  <select value={winnerId} onChange={event => setWinnerId(event.target.value)}>
                    <option value="">No winner</option>
                    {uniqueBidders.map(bid => (
                      <option key={bid.bidderId} value={bid.bidderId}>{bid.bidderUsername} — {formatIc(bid.amount)}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => onEnd(auction, winnerId)}>End Auction</button>
              </section>
            )}

            {canDelete && <button type="button" className="danger auction-clean-delete" onClick={() => onDelete(auction)}>Delete Auction</button>}
          </div>
        </div>
      </section>
    </div>
  );
}

function ListingsTools({
  search, setSearch, sort, setSort, verified, setVerified, min, setMin, max, setMax, minInterest, setMinInterest,
  resetFilters, toolsOpen, setToolsOpen, filterName, setFilterName, watchKeyword, setWatchKeyword,
  saveCurrentFilter, addWatch, savedFilters, watchlist, applySavedFilter, deleteSavedFilter, deleteWatch, currentUser
}) {
  return (
    <>
      <section className="tidy-tab-panel bazaar-controls bazaar-clean-controls">
        <div className="bazaar-control-header"><strong>Search & Filters</strong><button type="button" className="ghost" onClick={resetFilters}>Reset</button></div>
        <div className="bazaar-filter-grid">
          <label><span>Search</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={currentUser?.isAdmin ? 'Item, IC price, or owner...' : 'Item or IC price...'} /></label>
          <label><span>Min IC</span><input value={min} onChange={event => setMin(numberOnly(event.target.value))} placeholder="0" inputMode="numeric" /></label>
          <label><span>Max IC</span><input value={max} onChange={event => setMax(numberOnly(event.target.value))} placeholder="Any" inputMode="numeric" /></label>
          <label><span>Min Interest</span><input value={minInterest} onChange={event => setMinInterest(numberOnly(event.target.value))} placeholder="0" inputMode="numeric" /></label>
        </div>
        <div className="bazaar-filter-row">
          <div className="segmented-control compact bazaar-sort-tabs">{SORTS.map(option => <button type="button" key={option.key} className={sort === option.key ? 'active' : ''} onClick={() => setSort(option.key)}>{option.label}</button>)}</div>
          <div className="segmented-control compact bazaar-verified-tabs">{VERIFIED_FILTERS.map(option => <button type="button" key={option.key} className={verified === option.key ? 'active' : ''} onClick={() => setVerified(option.key)}>{option.label}</button>)}</div>
        </div>
      </section>

      <section className="tidy-tab-panel bazaar-tools-panel bazaar-clean-tools">
        <div className="panel-title-row compact"><div><h3>Saved Filters & Watchlist</h3><p className="muted">Save this search, or watch for future listings.</p></div><button type="button" className="ghost" onClick={() => setToolsOpen(value => !value)}>{toolsOpen ? 'Hide' : 'Show'}</button></div>
        {toolsOpen && <>
          <div className="bazaar-save-grid">
            <label><span>Filter name</span><input value={filterName} onChange={event => setFilterName(event.target.value)} placeholder="Ex: Cheap cosmics" /></label>
            <button type="button" onClick={saveCurrentFilter}>Save Filter</button>
            <label><span>Watch keyword</span><input value={watchKeyword} onChange={event => setWatchKeyword(event.target.value)} placeholder="Uses current price/verified filters" /></label>
            <button type="button" className="ghost" onClick={addWatch}>Add Watch</button>
          </div>
          <div className="bazaar-tool-columns clean">
            <div className="bazaar-tool-card"><strong>Saved Filters</strong>{savedFilters.length === 0 && <p className="muted">No saved filters yet.</p>}{savedFilters.map(filter => <div className="bazaar-tool-entry" key={filter.id}><button type="button" className="bazaar-tool-main" onClick={() => applySavedFilter(filter)}><strong>{filter.name}</strong><span>{filterSummary(filter.filters)}</span></button><button type="button" className="danger mini" onClick={() => deleteSavedFilter(filter.id)}>×</button></div>)}</div>
            <div className="bazaar-tool-card"><strong>Watchlist</strong>{watchlist.length === 0 && <p className="muted">No watched keywords yet.</p>}{watchlist.map(watch => <div className="bazaar-tool-entry" key={watch.id}><div className="bazaar-tool-main as-text"><strong>{watch.keyword}</strong><span>{watch.verifiedOnly ? 'Verified only' : 'All sellers'}{watch.minPrice ? ` · Min ${watch.minPrice} IC` : ''}{watch.maxPrice ? ` · Max ${watch.maxPrice} IC` : ''}</span></div><button type="button" className="danger mini" onClick={() => deleteWatch(watch.id)}>×</button></div>)}</div>
          </div>
        </>}
      </section>
    </>
  );
}

export default function Bazaar({ currentUser }) {
  const [activeTab, setActiveTab] = useState('listings');
  const [items, setItems] = useState([]);
  const [auctions, setAuctions] = useState([]);
  const [auctionItems, setAuctionItems] = useState([]);
  const [auctionStatus, setAuctionStatus] = useState('active');
  const [createOpen, setCreateOpen] = useState(false);
  const [auctionForm, setAuctionForm] = useState({ itemId: '', startingBid: '', buyoutPrice: '', minIncrement: '' });
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [auctionBids, setAuctionBids] = useState([]);
  const [bidAmount, setBidAmount] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [verified, setVerified] = useState('all');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [minInterest, setMinInterest] = useState('');
  const [savedFilters, setSavedFilters] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [filterName, setFilterName] = useState('');
  const [watchKeyword, setWatchKeyword] = useState('');
  const [toolsOpen, setToolsOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [auctionLoading, setAuctionLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedAuctionItem = useMemo(() => auctionItems.find(item => String(item.id) === String(auctionForm.itemId)) || null, [auctionItems, auctionForm.itemId]);
  const previewAuction = selectedAuctionItem ? {
    id: 'preview',
    title: selectedAuctionItem.title,
    image: selectedAuctionItem.image,
    startingBid: num(auctionForm.startingBid),
    currentBid: num(auctionForm.startingBid),
    buyoutPrice: num(auctionForm.buyoutPrice),
    minIncrement: num(auctionForm.minIncrement),
    bidCount: 0,
    status: 'active'
  } : null;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (sort) params.set('sort', sort);
    if (verified && verified !== 'all') params.set('verified', verified);
    if (min !== '') params.set('min', min);
    if (max !== '') params.set('max', max);
    if (minInterest !== '') params.set('minInterest', minInterest);
    return params.toString();
  }, [search, sort, verified, min, max, minInterest]);

  async function loadBazaar() {
    setLoading(true);
    setError('');
    try {
      const data = await api(`/api/bazaar${queryString ? `?${queryString}` : ''}`);
      setItems(data.items || []);
    } catch (err) {
      setError(err.message || 'Could not load Bazaar.');
    } finally {
      setLoading(false);
    }
  }

  async function loadAuctions() {
    setAuctionLoading(true);
    try {
      const data = await api(`/api/bazaar/auctions?status=${encodeURIComponent(auctionStatus)}`);
      setAuctions(data.auctions || []);
    } catch (err) {
      velkToast(err.message || 'Could not load auctions.', 'error');
    } finally {
      setAuctionLoading(false);
    }
  }

  async function loadAuctionItems() {
    if (!isVerifiedUser(currentUser)) return;
    try {
      const data = await api('/api/bazaar/auction-items');
      const next = safeArray(data.items);
      setAuctionItems(next);
      if (!auctionForm.itemId && next[0]?.id) setAuctionForm(current => ({ ...current, itemId: String(next[0].id) }));
    } catch (err) {
      velkToast(err.message || 'Could not load your auctionable items.', 'error');
    }
  }

  async function loadAuctionBids(auctionId) {
    try {
      const data = await api(`/api/bazaar/auctions/${auctionId}/bids`);
      const bids = safeArray(data.bids);
      setAuctionBids(bids);
      return bids;
    } catch (err) {
      setAuctionBids([]);
      velkToast(err.message || 'Could not load bids.', 'error');
      return [];
    }
  }

  async function loadFilterTools() {
    try {
      const [filtersData, watchData] = await Promise.allSettled([api('/api/bazaar/saved-filters'), api('/api/bazaar/watchlist')]);
      if (filtersData.status === 'fulfilled') setSavedFilters(safeArray(filtersData.value.filters || filtersData.value.savedFilters));
      if (watchData.status === 'fulfilled') setWatchlist(safeArray(watchData.value.watchlist || watchData.value.watches));
    } catch {}
  }

  useEffect(() => { loadFilterTools(); }, []);
  useEffect(() => { const timer = window.setTimeout(loadBazaar, 180); return () => window.clearTimeout(timer); }, [queryString]);
  useEffect(() => { if (activeTab === 'auctions') { loadAuctions(); loadAuctionItems(); } }, [activeTab, auctionStatus]);

  async function openAuction(auction) {
    setSelectedAuction(auction);
    setBidAmount(String(suggestedBid(auction)));
    await loadAuctionBids(auction.id);
  }

  function resetFilters() { setSearch(''); setSort('newest'); setVerified('all'); setMin(''); setMax(''); setMinInterest(''); }
  function applySavedFilter(filter) { const next = filter.filters || {}; setSearch(text(next.search)); setSort(text(next.sort, 'newest')); setVerified(text(next.verified, 'all')); setMin(text(next.min)); setMax(text(next.max)); setMinInterest(text(next.minInterest)); velkToast(`Applied filter: ${filter.name}`, 'success'); }

  async function saveCurrentFilter() {
    const name = filterName.trim() || window.prompt('Saved filter name:', search || 'Bazaar Filter');
    if (!name) return;
    try {
      await api('/api/bazaar/saved-filters', { method: 'POST', body: JSON.stringify({ name, filters: currentFilters({ search, sort, verified, min, max, minInterest }) }) });
      setFilterName('');
      await loadFilterTools();
      velkToast('Bazaar filter saved.', 'success');
    } catch (err) { velkToast(err.message || 'Could not save Bazaar filter.', 'error'); }
  }

  async function deleteSavedFilter(id) { try { await api(`/api/bazaar/saved-filters/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadFilterTools(); velkToast('Saved filter deleted.', 'success'); } catch (err) { velkToast(err.message || 'Could not delete saved filter.', 'error'); } }
  async function addWatch() { const keyword = watchKeyword.trim() || search.trim(); if (!keyword) return velkToast('Enter a keyword or search first.', 'warning'); try { await api('/api/bazaar/watchlist', { method: 'POST', body: JSON.stringify({ keyword, minPrice: min, maxPrice: max, verifiedOnly: verified === 'verified' }) }); setWatchKeyword(''); await loadFilterTools(); velkToast('Watchlist entry added.', 'success'); } catch (err) { velkToast(err.message || 'Could not add watchlist entry.', 'error'); } }
  async function deleteWatch(id) { try { await api(`/api/bazaar/watchlist/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadFilterTools(); velkToast('Watchlist entry removed.', 'success'); } catch (err) { velkToast(err.message || 'Could not remove watchlist entry.', 'error'); } }

  async function createAuction(event) {
    event.preventDefault();
    if (!isVerifiedUser(currentUser)) return velkToast('Verified users only.', 'warning');
    if (!auctionForm.itemId) return velkToast('Choose an item first.', 'warning');
    try {
      await api('/api/bazaar/auctions', { method: 'POST', body: JSON.stringify(auctionForm) });
      setAuctionForm({ itemId: '', startingBid: '', buyoutPrice: '', minIncrement: '' });
      setCreateOpen(false);
      await Promise.all([loadAuctions(), loadAuctionItems()]);
      velkToast('Auction created.', 'success');
    } catch (err) { velkToast(err.message || 'Could not create auction.', 'error'); }
  }

  async function placeBid(auction, amount) {
    try {
      await api(`/api/bazaar/auctions/${auction.id}/bid`, { method: 'POST', body: JSON.stringify({ amount }) });
      await Promise.all([loadAuctions(), loadAuctionBids(auction.id)]);
      const refreshed = (await api(`/api/bazaar/auctions?status=active`)).auctions?.find(next => String(next.id) === String(auction.id));
      if (refreshed) setSelectedAuction(refreshed);
      setBidAmount('');
      velkToast('Bid placed.', 'success');
    } catch (err) { velkToast(err.message || 'Could not place bid.', 'error'); }
  }

  async function buyoutAuction(auction) {
    if (!window.confirm(`Offer buyout for ${formatIc(buyoutPrice(auction))}?`)) return;
    try {
      await api(`/api/bazaar/auctions/${auction.id}/buyout`, { method: 'POST' });
      await Promise.all([loadAuctions(), loadAuctionBids(auction.id)]);
      velkToast('Buyout offered.', 'success');
    } catch (err) { velkToast(err.message || 'Could not offer buyout.', 'error'); }
  }

  async function endAuction(auction, winnerId) {
    try {
      await api(`/api/bazaar/auctions/${auction.id}/end`, { method: 'POST', body: JSON.stringify({ winnerId: winnerId || null }) });
      setSelectedAuction(null);
      await loadAuctions();
      velkToast('Auction ended.', 'success');
    } catch (err) { velkToast(err.message || 'Could not end auction.', 'error'); }
  }

  async function deleteAuction(auction) {
    if (!window.confirm(`Delete auction for ${auction.title}?`)) return;
    try {
      await api(`/api/bazaar/auctions/${auction.id}`, { method: 'DELETE' });
      setSelectedAuction(null);
      await loadAuctions();
      velkToast('Auction deleted.', 'success');
    } catch (err) { velkToast(err.message || 'Could not delete auction.', 'error'); }
  }

  return (
    <section className="card bazaar-page bazaar-rewrite-shell inventory-rewrite-shell auction-rewrite-v2">
      <div className="panel-title-row"><div><h2>Bazaar</h2><p className="muted">Listings and verified-user auctions with buyout support.</p></div><button type="button" onClick={activeTab === 'auctions' ? loadAuctions : loadBazaar}>Refresh</button></div>
      {error && <p className="error">{error}</p>}
      <div className="segmented-control compact bazaar-main-tabs"><button type="button" className={activeTab === 'listings' ? 'active' : ''} onClick={() => setActiveTab('listings')}>Listings</button><button type="button" className={activeTab === 'auctions' ? 'active' : ''} onClick={() => setActiveTab('auctions')}>Auctions</button></div>

      {activeTab === 'listings' && (
        <>
          <ListingsTools search={search} setSearch={setSearch} sort={sort} setSort={setSort} verified={verified} setVerified={setVerified} min={min} setMin={setMin} max={max} setMax={setMax} minInterest={minInterest} setMinInterest={setMinInterest} resetFilters={resetFilters} toolsOpen={toolsOpen} setToolsOpen={setToolsOpen} filterName={filterName} setFilterName={setFilterName} watchKeyword={watchKeyword} setWatchKeyword={setWatchKeyword} saveCurrentFilter={saveCurrentFilter} addWatch={addWatch} savedFilters={savedFilters} watchlist={watchlist} applySavedFilter={applySavedFilter} deleteSavedFilter={deleteSavedFilter} deleteWatch={deleteWatch} currentUser={currentUser} />
          <p className="muted tidy-count">{loading ? 'Loading Bazaar...' : `Showing ${items.length} listing${items.length === 1 ? '' : 's'}.`}</p>
          {items.length === 0 && !loading && <p className="muted tidy-empty">No valid IC listings found for recently active players.</p>}
          <div className="inventory-mosaic-grid bazaar-grid bazaar-mosaic-grid item-grid inventory-grid vt-unified-mosaic-grid">{items.map(item => <BazaarListingCard key={item.id || item.image || text(item.title)} item={item} currentUser={currentUser} />)}</div>
        </>
      )}

      {activeTab === 'auctions' && (
        <>
          <section className="auction-board-panel">
            <div className="panel-title-row compact">
              <div><h3>Auction Board</h3><p className="muted">Click an auction to view bid history, bid, buy out, or manage your auction.</p></div>
              <div className="segmented-control compact">{AUCTION_TABS.map(tab => <button type="button" key={tab.key} className={auctionStatus === tab.key ? 'active' : ''} onClick={() => setAuctionStatus(tab.key)}>{tab.label}</button>)}</div>
            </div>
            {isVerifiedUser(currentUser) ? (
              <>
                <button type="button" className="ghost" onClick={() => { setCreateOpen(value => !value); loadAuctionItems(); }}>{createOpen ? 'Hide Create Auction' : 'Create Auction'}</button>
                {createOpen && (
                  <form className="auction-create-v2" onSubmit={createAuction}>
                    <div className="auction-create-fields">
                      <label><span>Item</span><select value={auctionForm.itemId} onChange={event => setAuctionForm(current => ({ ...current, itemId: event.target.value }))} required><option value="">Choose one of your items...</option>{auctionItems.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                      <label><span>Starting bid</span><input value={auctionForm.startingBid} onChange={event => setAuctionForm(current => ({ ...current, startingBid: numberOnly(event.target.value) }))} placeholder="100000" required inputMode="numeric" /></label>
                      <label><span>Minimum bid increment</span><input value={auctionForm.minIncrement} onChange={event => setAuctionForm(current => ({ ...current, minIncrement: numberOnly(event.target.value) }))} placeholder="Optional fixed amount, e.g. 500000" inputMode="numeric" /></label>
                      <label><span>Buyout price</span><input value={auctionForm.buyoutPrice} onChange={event => setAuctionForm(current => ({ ...current, buyoutPrice: numberOnly(event.target.value) }))} placeholder="Optional" inputMode="numeric" /></label>
                      <button type="submit">Start Auction</button>
                    </div>
                    <div className="auction-preview-v2">
                      <strong>Preview</strong>
                      {previewAuction ? <AuctionCard auction={previewAuction} preview /> : <p className="muted">Choose an item to preview the auction.</p>}
                    </div>
                    {auctionItems.length === 0 && <p className="muted">No auctionable items found. Items already in active auctions or trade-pending are hidden.</p>}
                  </form>
                )}
              </>
            ) : <p className="muted">Only verified users can create auctions or bid.</p>}
          </section>

          <p className="muted tidy-count">{auctionLoading ? 'Loading auctions...' : `Showing ${auctions.length} auction${auctions.length === 1 ? '' : 's'}.`}</p>
          {auctions.length === 0 && !auctionLoading && <p className="muted tidy-empty">No auctions found.</p>}
          <div className="auction-clean-grid">{auctions.map(auction => <AuctionCard key={auction.id} auction={auction} onOpen={openAuction} />)}</div>
        </>
      )}

      <AuctionModal auction={selectedAuction} bids={auctionBids} bidAmount={bidAmount} setBidAmount={setBidAmount} currentUser={currentUser} onClose={() => setSelectedAuction(null)} onBid={placeBid} onBuyout={buyoutAuction} onEnd={endAuction} onDelete={deleteAuction} />
    </section>
  );
}
