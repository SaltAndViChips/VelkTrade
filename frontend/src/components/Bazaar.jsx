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
    try {
      const json = JSON.stringify(value);
      return json && json !== '{}' ? json : fallback;
    } catch {
      return fallback;
    }
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

function BazaarMosaicItem({ item, currentUser }) {
  const [hovered, setHovered] = useState(false);
  const title = vtText(item.title, 'Item');
  const image = vtText(item.image);
  const price = itemPrice(item);
  const shownTitle = hovered && price ? price : title;
  const verifiedInterestCount = Number(item.interestCount || 0);

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
      <div className="bazaar-mosaic-meta" aria-label="Bazaar listing details">
        {currentUser?.isAdmin && item.ownerUsername && (
          <span className="bazaar-owner-line">Owner: <strong>{item.ownerUsername}</strong>{item.ownerVerified && <span className="verified-badge mini" title="Verified user">✓</span>}</span>
        )}
        {item.ownerVerified && !currentUser?.isAdmin && <span className="bazaar-owner-line"><span className="verified-badge mini" title="Verified user">✓</span> Verified seller</span>}
        <span className="bazaar-interest-line">{verifiedInterestCount} verified interested</span>
        {item.viewerInterested && <span className="status-pill bazaar-watch-pill">you are interested</span>}
      </div>
    </article>
  );
}

export default function Bazaar({ currentUser }) {
  const [items, setItems] = useState([]);
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
  const [error, setError] = useState('');

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

  async function loadFilterTools() {
    try {
      const [filtersData, watchData] = await Promise.allSettled([
        api('/api/bazaar/saved-filters'),
        api('/api/bazaar/watchlist')
      ]);
      if (filtersData.status === 'fulfilled') setSavedFilters(safeArray(filtersData.value.filters || filtersData.value.savedFilters));
      if (watchData.status === 'fulfilled') setWatchlist(safeArray(watchData.value.watchlist || watchData.value.watches));
    } catch {}
  }

  useEffect(() => { loadFilterTools(); }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadBazaar, 180);
    return () => window.clearTimeout(timer);
  }, [queryString]);

  function resetFilters() {
    setSearch('');
    setSort('newest');
    setVerified('all');
    setMin('');
    setMax('');
    setMinInterest('');
  }

  function applySavedFilter(filter) {
    const next = filter.filters || {};
    setSearch(vtText(next.search));
    setSort(vtText(next.sort, 'newest'));
    setVerified(vtText(next.verified, 'all'));
    setMin(vtText(next.min));
    setMax(vtText(next.max));
    setMinInterest(vtText(next.minInterest));
    velkToast(`Applied filter: ${filter.name}`, 'success');
  }

  async function saveCurrentFilter() {
    const name = filterName.trim() || window.prompt('Saved filter name:', search || 'Bazaar Filter');
    if (!name) return;
    try {
      await api('/api/bazaar/saved-filters', {
        method: 'POST',
        body: JSON.stringify({ name, filters: currentFilters({ search, sort, verified, min, max, minInterest }) })
      });
      setFilterName('');
      await loadFilterTools();
      velkToast('Bazaar filter saved.', 'success');
    } catch (err) {
      velkToast(err.message || 'Could not save Bazaar filter.', 'error');
    }
  }

  async function deleteSavedFilter(id) {
    try {
      await api(`/api/bazaar/saved-filters/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadFilterTools();
      velkToast('Saved filter deleted.', 'success');
    } catch (err) {
      velkToast(err.message || 'Could not delete saved filter.', 'error');
    }
  }

  async function addWatch() {
    const keyword = watchKeyword.trim() || search.trim();
    if (!keyword) {
      velkToast('Enter a keyword or search first.', 'warning');
      return;
    }
    try {
      await api('/api/bazaar/watchlist', {
        method: 'POST',
        body: JSON.stringify({ keyword, minPrice: min, maxPrice: max, verifiedOnly: verified === 'verified' })
      });
      setWatchKeyword('');
      await loadFilterTools();
      velkToast('Watchlist entry added.', 'success');
    } catch (err) {
      velkToast(err.message || 'Could not add watchlist entry.', 'error');
    }
  }

  async function deleteWatch(id) {
    try {
      await api(`/api/bazaar/watchlist/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadFilterTools();
      velkToast('Watchlist entry removed.', 'success');
    } catch (err) {
      velkToast(err.message || 'Could not remove watchlist entry.', 'error');
    }
  }

  return (
    <section className="card bazaar-page bazaar-rewrite-shell inventory-rewrite-shell">
      <div className="panel-title-row">
        <div>
          <h2>Bazaar</h2>
          <p className="muted">Valid IC listings from players active within the last 7 days.</p>
        </div>
        <button type="button" onClick={loadBazaar}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="tidy-tab-panel bazaar-controls bazaar-clean-controls">
        <div className="bazaar-control-header">
          <strong>Search & Filters</strong>
          <button type="button" className="ghost" onClick={resetFilters}>Reset</button>
        </div>
        <div className="bazaar-filter-grid">
          <label><span>Search</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={currentUser?.isAdmin ? 'Item, IC price, or owner...' : 'Item or IC price...'} /></label>
          <label><span>Min IC</span><input value={min} onChange={event => setMin(event.target.value.replace(/[^\d.]/g, ''))} placeholder="0" inputMode="decimal" /></label>
          <label><span>Max IC</span><input value={max} onChange={event => setMax(event.target.value.replace(/[^\d.]/g, ''))} placeholder="Any" inputMode="decimal" /></label>
          <label><span>Min Interest</span><input value={minInterest} onChange={event => setMinInterest(event.target.value.replace(/[^\d]/g, ''))} placeholder="0" inputMode="numeric" /></label>
        </div>
        <div className="bazaar-filter-row">
          <div className="segmented-control compact bazaar-sort-tabs">
            {SORTS.map(option => <button type="button" key={option.key} className={sort === option.key ? 'active' : ''} onClick={() => setSort(option.key)}>{option.label}</button>)}
          </div>
          <div className="segmented-control compact bazaar-verified-tabs">
            {VERIFIED_FILTERS.map(option => <button type="button" key={option.key} className={verified === option.key ? 'active' : ''} onClick={() => setVerified(option.key)}>{option.label}</button>)}
          </div>
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
            <div className="bazaar-tool-card">
              <strong>Saved Filters</strong>
              {savedFilters.length === 0 && <p className="muted">No saved filters yet.</p>}
              {savedFilters.map(filter => <div className="bazaar-tool-entry" key={filter.id}><button type="button" className="bazaar-tool-main" onClick={() => applySavedFilter(filter)}><strong>{filter.name}</strong><span>{filterSummary(filter.filters)}</span></button><button type="button" className="danger mini" onClick={() => deleteSavedFilter(filter.id)}>×</button></div>)}
            </div>
            <div className="bazaar-tool-card">
              <strong>Watchlist</strong>
              {watchlist.length === 0 && <p className="muted">No watched keywords yet.</p>}
              {watchlist.map(watch => <div className="bazaar-tool-entry" key={watch.id}><div className="bazaar-tool-main as-text"><strong>{watch.keyword}</strong><span>{watch.verifiedOnly ? 'Verified only' : 'All sellers'}{watch.minPrice ? ` · Min ${watch.minPrice} IC` : ''}{watch.maxPrice ? ` · Max ${watch.maxPrice} IC` : ''}</span></div><button type="button" className="danger mini" onClick={() => deleteWatch(watch.id)}>×</button></div>)}
            </div>
          </div>
        </>}
      </section>

      <p className="muted tidy-count">{loading ? 'Loading Bazaar...' : `Showing ${items.length} listing${items.length === 1 ? '' : 's'}.`}</p>
      {items.length === 0 && !loading && <p className="muted tidy-empty">No valid IC listings found for recently active players.</p>}

      <div className="inventory-mosaic-grid bazaar-grid bazaar-mosaic-grid item-grid inventory-grid vt-unified-mosaic-grid">
        {items.map(item => <BazaarMosaicItem key={item.id || item.image || vtText(item.title)} item={item} currentUser={currentUser} />)}
      </div>
    </section>
  );
}
