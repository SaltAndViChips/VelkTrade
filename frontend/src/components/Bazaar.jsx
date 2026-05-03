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

function vtText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (typeof value.title === 'string') return value.title;
    if (typeof value.name === 'string') return value.name;
    if (typeof value.username === 'string') return value.username;
    try { const json = JSON.stringify(value); return json && json !== '{}' ? json : fallback; } catch { return fallback; }
  }
  return fallback;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString();
}

function itemPrice(item) {
  const amount = formatNumber(item.priceAmount ?? item.price_amount ?? item.price);
  return amount ? `${amount} IC` : vtText(item.price, '');
}

function safeArray(value) { return Array.isArray(value) ? value : []; }
function isVerifiedUser(user) { return Boolean(user?.isVerified || user?.is_verified || user?.verified || user?.isTrusted || user?.is_trusted || user?.isAdmin || user?.is_admin); }
function numericInput(value) { return String(value || '').replace(/[^\d]/g, ''); }
function currentFilters({ search, sort, verified, min, max, minInterest }) { return { search, sort, verified, min, max, minInterest }; }
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

function BazaarMosaicItem({ item, currentUser }) {
  const [hovered, setHovered] = useState(false);
  const title = vtText(item.title, 'Item');
  const image = vtText(item.image);
  const price = itemPrice(item);
  const shownTitle = hovered && price ? price : title;
  const verifiedInterestCount = Number(item.interestCount || 0);
  return <article className={`inventory-mosaic-item bazaar-mosaic-item item-card vt-unified-item-card ${hovered && price ? 'vt-hover-price-title' : ''}`} data-item-id={item.id || ''} data-id={item.id || ''} data-title={title} data-vt-original-title={title} data-price={price} data-vt-price={price} data-vt-react-hover="true" data-vt-hover-swap-bound="true" data-owner-id={item.ownerId || item.owner_id || item.userId || item.userid || ''} data-owner-username={item.ownerUsername || ''} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}>
    <div className="inventory-mosaic-image-frame bazaar-mosaic-image-frame">{image ? <img src={image} alt={title} draggable="false" /> : <div className="inventory-mosaic-placeholder">?</div>}</div>
    <span className="item-title inventory-mosaic-title">{shownTitle}</span>
    <div className="bazaar-mosaic-meta" aria-label="Bazaar listing details">
      {currentUser?.isAdmin && item.ownerUsername && <span className="bazaar-owner-line">Owner: <strong>{item.ownerUsername}</strong>{item.ownerVerified && <span className="verified-badge mini" title="Verified user">✓</span>}</span>}
      {item.ownerVerified && !currentUser?.isAdmin && <span className="bazaar-owner-line"><span className="verified-badge mini" title="Verified user">✓</span> Verified seller</span>}
      <span className="bazaar-interest-line">{verifiedInterestCount} verified interested</span>
      {item.viewerInterested && <span className="status-pill bazaar-watch-pill">you are interested</span>}
    </div>
  </article>;
}

function AuctionMosaicItem({ auction, currentUser, onBid, onBuyout }) {
  const [hovered, setHovered] = useState(false);
  const [bid, setBid] = useState('');
  const title = vtText(auction.title, 'Auction Item');
  const image = vtText(auction.image);
  const currentBid = Number(auction.currentBid || auction.winningBid || auction.startingBid || 0);
  const buyout = Number(auction.buyoutPrice || 0);
  const price = hovered ? `${formatNumber(currentBid)} IC bid` : title;
  const minBid = currentBid + 1;
  const canAct = isVerifiedUser(currentUser) && !auction.viewerIsSeller && auction.status === 'active';
  return <article className={`inventory-mosaic-item bazaar-mosaic-item bazaar-auction-item item-card vt-unified-item-card ${hovered ? 'vt-hover-price-title' : ''}`} data-item-id={auction.itemId || ''} data-id={auction.itemId || ''} data-title={title} data-vt-original-title={title} data-price={`${formatNumber(currentBid)} IC`} data-vt-price={`${formatNumber(currentBid)} IC`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
    <div className="inventory-mosaic-image-frame bazaar-mosaic-image-frame">{image ? <img src={image} alt={title} draggable="false" /> : <div className="inventory-mosaic-placeholder">?</div>}</div>
    <span className="item-title inventory-mosaic-title">{price}</span>
    <div className="bazaar-mosaic-meta auction-meta">
      <span><strong>Current:</strong> {formatNumber(currentBid)} IC</span>
      <span><strong>Buyout:</strong> {buyout ? `${formatNumber(buyout)} IC` : 'None'}</span>
      <span><strong>Bids:</strong> {auction.bidCount || 0}</span>
      {auction.sellerUsername && <span>Seller: <strong>{auction.sellerUsername}</strong>{auction.sellerVerified && <span className="verified-badge mini">✓</span>}</span>}
      {auction.viewerIsWinner && <span className="status-pill bazaar-watch-pill">you are winning</span>}
    </div>
    {canAct && <div className="auction-action-row" onClick={event => event.stopPropagation()}>
      <input value={bid} onChange={event => setBid(numericInput(event.target.value))} placeholder={`Min ${formatNumber(minBid)}`} inputMode="numeric" />
      <button type="button" onClick={() => onBid(auction, bid || minBid)}>Bid</button>
      {buyout > 0 && <button type="button" className="ghost" onClick={() => onBuyout(auction)}>Buyout</button>}
    </div>}
    {!isVerifiedUser(currentUser) && <p className="muted auction-verified-note">Verified users only.</p>}
  </article>;
}

function AuctionPreview({ item, startingBid, buyoutPrice }) {
  if (!item) return <p className="muted auction-preview-empty">Choose an item to preview the auction card.</p>;
  const bid = Number(startingBid || 0);
  const buyout = Number(buyoutPrice || 0);
  return <div className="auction-preview-card">
    <div className="auction-preview-image">{item.image ? <img src={item.image} alt={item.title} draggable="false" /> : <div className="inventory-mosaic-placeholder">?</div>}</div>
    <div className="auction-preview-info">
      <strong>{item.title}</strong>
      <span>Starting bid: {bid > 0 ? `${formatNumber(bid)} IC` : 'Not set'}</span>
      <span>Buyout: {buyout > 0 ? `${formatNumber(buyout)} IC` : 'None'}</span>
      {item.price && <span>Current list price: {item.price}</span>}
    </div>
  </div>;
}

export default function Bazaar({ currentUser }) {
  const [activeTab, setActiveTab] = useState('listings');
  const [items, setItems] = useState([]);
  const [auctions, setAuctions] = useState([]);
  const [auctionItems, setAuctionItems] = useState([]);
  const [auctionStatus, setAuctionStatus] = useState('active');
  const [createOpen, setCreateOpen] = useState(false);
  const [auctionForm, setAuctionForm] = useState({ itemId: '', startingBid: '', buyoutPrice: '' });
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

  async function loadBazaar() { setLoading(true); setError(''); try { const data = await api(`/api/bazaar${queryString ? `?${queryString}` : ''}`); setItems(data.items || []); } catch (err) { setError(err.message || 'Could not load Bazaar.'); } finally { setLoading(false); } }
  async function loadAuctions() { setAuctionLoading(true); try { const data = await api(`/api/bazaar/auctions?status=${encodeURIComponent(auctionStatus)}`); setAuctions(data.auctions || []); } catch (err) { velkToast(err.message || 'Could not load auctions.', 'error'); } finally { setAuctionLoading(false); } }
  async function loadAuctionItems() { if (!isVerifiedUser(currentUser)) return; try { const data = await api('/api/bazaar/auction-items'); const next = safeArray(data.items); setAuctionItems(next); if (!auctionForm.itemId && next[0]?.id) setAuctionForm(current => ({ ...current, itemId: String(next[0].id) })); } catch (err) { velkToast(err.message || 'Could not load your auctionable items.', 'error'); } }
  async function loadFilterTools() { try { const [filtersData, watchData] = await Promise.allSettled([api('/api/bazaar/saved-filters'), api('/api/bazaar/watchlist')]); if (filtersData.status === 'fulfilled') setSavedFilters(safeArray(filtersData.value.filters || filtersData.value.savedFilters)); if (watchData.status === 'fulfilled') setWatchlist(safeArray(watchData.value.watchlist || watchData.value.watches)); } catch {} }
  useEffect(() => { loadFilterTools(); }, []);
  useEffect(() => { const timer = window.setTimeout(loadBazaar, 180); return () => window.clearTimeout(timer); }, [queryString]);
  useEffect(() => { if (activeTab === 'auctions') { loadAuctions(); loadAuctionItems(); } }, [activeTab, auctionStatus]);

  function resetFilters() { setSearch(''); setSort('newest'); setVerified('all'); setMin(''); setMax(''); setMinInterest(''); }
  function applySavedFilter(filter) { const next = filter.filters || {}; setSearch(vtText(next.search)); setSort(vtText(next.sort, 'newest')); setVerified(vtText(next.verified, 'all')); setMin(vtText(next.min)); setMax(vtText(next.max)); setMinInterest(vtText(next.minInterest)); velkToast(`Applied filter: ${filter.name}`, 'success'); }
  async function saveCurrentFilter() { const name = filterName.trim() || window.prompt('Saved filter name:', search || 'Bazaar Filter'); if (!name) return; try { await api('/api/bazaar/saved-filters', { method: 'POST', body: JSON.stringify({ name, filters: currentFilters({ search, sort, verified, min, max, minInterest }) }) }); setFilterName(''); await loadFilterTools(); velkToast('Bazaar filter saved.', 'success'); } catch (err) { velkToast(err.message || 'Could not save Bazaar filter.', 'error'); } }
  async function deleteSavedFilter(id) { try { await api(`/api/bazaar/saved-filters/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadFilterTools(); velkToast('Saved filter deleted.', 'success'); } catch (err) { velkToast(err.message || 'Could not delete saved filter.', 'error'); } }
  async function addWatch() { const keyword = watchKeyword.trim() || search.trim(); if (!keyword) return velkToast('Enter a keyword or search first.', 'warning'); try { await api('/api/bazaar/watchlist', { method: 'POST', body: JSON.stringify({ keyword, minPrice: min, maxPrice: max, verifiedOnly: verified === 'verified' }) }); setWatchKeyword(''); await loadFilterTools(); velkToast('Watchlist entry added.', 'success'); } catch (err) { velkToast(err.message || 'Could not add watchlist entry.', 'error'); } }
  async function deleteWatch(id) { try { await api(`/api/bazaar/watchlist/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadFilterTools(); velkToast('Watchlist entry removed.', 'success'); } catch (err) { velkToast(err.message || 'Could not remove watchlist entry.', 'error'); } }
  async function createAuction(event) { event.preventDefault(); if (!isVerifiedUser(currentUser)) return velkToast('Verified users only.', 'warning'); if (!auctionForm.itemId) return velkToast('Choose an item first.', 'warning'); try { await api('/api/bazaar/auctions', { method: 'POST', body: JSON.stringify(auctionForm) }); setAuctionForm({ itemId: '', startingBid: '', buyoutPrice: '' }); setCreateOpen(false); await Promise.all([loadAuctions(), loadAuctionItems()]); velkToast('Auction created.', 'success'); } catch (err) { velkToast(err.message || 'Could not create auction.', 'error'); } }
  async function placeBid(auction, amount) { try { await api(`/api/bazaar/auctions/${auction.id}/bid`, { method: 'POST', body: JSON.stringify({ amount }) }); await loadAuctions(); velkToast('Bid placed.', 'success'); } catch (err) { velkToast(err.message || 'Could not place bid.', 'error'); } }
  async function buyoutAuction(auction) { if (!window.confirm(`Buy out ${auction.title} for ${formatNumber(auction.buyoutPrice)} IC?`)) return; try { await api(`/api/bazaar/auctions/${auction.id}/buyout`, { method: 'POST' }); await loadAuctions(); velkToast('Auction bought out.', 'success'); } catch (err) { velkToast(err.message || 'Could not buy out auction.', 'error'); } }

  return <section className="card bazaar-page bazaar-rewrite-shell inventory-rewrite-shell">
    <div className="panel-title-row"><div><h2>Bazaar</h2><p className="muted">Listings and verified-user auctions with buyout support.</p></div><button type="button" onClick={activeTab === 'auctions' ? loadAuctions : loadBazaar}>Refresh</button></div>
    {error && <p className="error">{error}</p>}
    <div className="segmented-control compact bazaar-main-tabs"><button type="button" className={activeTab === 'listings' ? 'active' : ''} onClick={() => setActiveTab('listings')}>Listings</button><button type="button" className={activeTab === 'auctions' ? 'active' : ''} onClick={() => setActiveTab('auctions')}>Auctions</button></div>

    {activeTab === 'listings' && <>
      <section className="tidy-tab-panel bazaar-controls bazaar-clean-controls"><div className="bazaar-control-header"><strong>Search & Filters</strong><button type="button" className="ghost" onClick={resetFilters}>Reset</button></div><div className="bazaar-filter-grid"><label><span>Search</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={currentUser?.isAdmin ? 'Item, IC price, or owner...' : 'Item or IC price...'} /></label><label><span>Min IC</span><input value={min} onChange={event => setMin(numericInput(event.target.value))} placeholder="0" inputMode="numeric" /></label><label><span>Max IC</span><input value={max} onChange={event => setMax(numericInput(event.target.value))} placeholder="Any" inputMode="numeric" /></label><label><span>Min Interest</span><input value={minInterest} onChange={event => setMinInterest(numericInput(event.target.value))} placeholder="0" inputMode="numeric" /></label></div><div className="bazaar-filter-row"><div className="segmented-control compact bazaar-sort-tabs">{SORTS.map(option => <button type="button" key={option.key} className={sort === option.key ? 'active' : ''} onClick={() => setSort(option.key)}>{option.label}</button>)}</div><div className="segmented-control compact bazaar-verified-tabs">{VERIFIED_FILTERS.map(option => <button type="button" key={option.key} className={verified === option.key ? 'active' : ''} onClick={() => setVerified(option.key)}>{option.label}</button>)}</div></div></section>
      <section className="tidy-tab-panel bazaar-tools-panel bazaar-clean-tools"><div className="panel-title-row compact"><div><h3>Saved Filters & Watchlist</h3><p className="muted">Save this search, or watch for future listings.</p></div><button type="button" className="ghost" onClick={() => setToolsOpen(value => !value)}>{toolsOpen ? 'Hide' : 'Show'}</button></div>{toolsOpen && <><div className="bazaar-save-grid"><label><span>Filter name</span><input value={filterName} onChange={event => setFilterName(event.target.value)} placeholder="Ex: Cheap cosmics" /></label><button type="button" onClick={saveCurrentFilter}>Save Filter</button><label><span>Watch keyword</span><input value={watchKeyword} onChange={event => setWatchKeyword(event.target.value)} placeholder="Uses current price/verified filters" /></label><button type="button" className="ghost" onClick={addWatch}>Add Watch</button></div><div className="bazaar-tool-columns clean"><div className="bazaar-tool-card"><strong>Saved Filters</strong>{savedFilters.length === 0 && <p className="muted">No saved filters yet.</p>}{savedFilters.map(filter => <div className="bazaar-tool-entry" key={filter.id}><button type="button" className="bazaar-tool-main" onClick={() => applySavedFilter(filter)}><strong>{filter.name}</strong><span>{filterSummary(filter.filters)}</span></button><button type="button" className="danger mini" onClick={() => deleteSavedFilter(filter.id)}>×</button></div>)}</div><div className="bazaar-tool-card"><strong>Watchlist</strong>{watchlist.length === 0 && <p className="muted">No watched keywords yet.</p>}{watchlist.map(watch => <div className="bazaar-tool-entry" key={watch.id}><div className="bazaar-tool-main as-text"><strong>{watch.keyword}</strong><span>{watch.verifiedOnly ? 'Verified only' : 'All sellers'}{watch.minPrice ? ` · Min ${watch.minPrice} IC` : ''}{watch.maxPrice ? ` · Max ${watch.maxPrice} IC` : ''}</span></div><button type="button" className="danger mini" onClick={() => deleteWatch(watch.id)}>×</button></div>)}</div></div></>}</section>
      <p className="muted tidy-count">{loading ? 'Loading Bazaar...' : `Showing ${items.length} listing${items.length === 1 ? '' : 's'}.`}</p>{items.length === 0 && !loading && <p className="muted tidy-empty">No valid IC listings found for recently active players.</p>}<div className="inventory-mosaic-grid bazaar-grid bazaar-mosaic-grid item-grid inventory-grid vt-unified-mosaic-grid">{items.map(item => <BazaarMosaicItem key={item.id || item.image || vtText(item.title)} item={item} currentUser={currentUser} />)}</div>
    </>}

    {activeTab === 'auctions' && <>
      <section className="tidy-tab-panel bazaar-clean-tools"><div className="panel-title-row compact"><div><h3>Auction Board</h3><p className="muted">Verified users can create auctions, bid, or buy out instantly.</p></div><div className="segmented-control compact"><button type="button" className={auctionStatus === 'active' ? 'active' : ''} onClick={() => setAuctionStatus('active')}>Active</button><button type="button" className={auctionStatus === 'all' ? 'active' : ''} onClick={() => setAuctionStatus('all')}>All</button></div></div>{isVerifiedUser(currentUser) ? <><button type="button" className="ghost" onClick={() => { setCreateOpen(value => !value); loadAuctionItems(); }}>{createOpen ? 'Hide Create Auction' : 'Create Auction'}</button>{createOpen && <form className="auction-create-form auction-create-enhanced" onSubmit={createAuction}><label className="auction-item-select-label"><span>Item</span><select value={auctionForm.itemId} onChange={event => setAuctionForm(current => ({ ...current, itemId: event.target.value }))} required><option value="">Choose one of your items...</option>{auctionItems.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label><span>Starting bid</span><input value={auctionForm.startingBid} onChange={event => setAuctionForm(current => ({ ...current, startingBid: numericInput(event.target.value) }))} placeholder="100000" required /></label><label><span>Buyout price</span><input value={auctionForm.buyoutPrice} onChange={event => setAuctionForm(current => ({ ...current, buyoutPrice: numericInput(event.target.value) }))} placeholder="Optional" /></label><button type="submit">Start Auction</button><AuctionPreview item={selectedAuctionItem} startingBid={auctionForm.startingBid} buyoutPrice={auctionForm.buyoutPrice} />{auctionItems.length === 0 && <p className="muted">No auctionable items found. Items already in active auctions or trade-pending are hidden.</p>}</form>}</> : <p className="muted">Only verified users can create auctions or bid.</p>}</section>
      <p className="muted tidy-count">{auctionLoading ? 'Loading auctions...' : `Showing ${auctions.length} auction${auctions.length === 1 ? '' : 's'}.`}</p>{auctions.length === 0 && !auctionLoading && <p className="muted tidy-empty">No auctions found.</p>}<div className="inventory-mosaic-grid bazaar-grid bazaar-mosaic-grid item-grid inventory-grid vt-unified-mosaic-grid">{auctions.map(auction => <AuctionMosaicItem key={auction.id} auction={auction} currentUser={currentUser} onBid={placeBid} onBuyout={buyoutAuction} />)}</div>
    </>}
  </section>;
}
