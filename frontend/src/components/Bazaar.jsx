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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function currentFilters({ search, sort, verified, min, max, minInterest }) {
  return { search, sort, verified, min, max, minInterest };
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

  useEffect(() => {
    loadFilterTools();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadBazaar, 180);
    return () => window.clearTimeout(timer);
  }, [queryString]);

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
    <section className="card bazaar-page">
      <div className="panel-title-row">
        <div>
          <h2>Bazaar</h2>
          <p className="muted">Valid IC listings from players active within the last 7 days.</p>
        </div>
        <button type="button" onClick={loadBazaar}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="tidy-tab-panel bazaar-controls">
        <div className="tidy-toolbar bazaar-toolbar">
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder={currentUser?.isAdmin ? 'Search by item, IC price, or owner...' : 'Search by item or IC price...'} />
          <input value={min} onChange={event => setMin(event.target.value.replace(/[^\d.]/g, ''))} placeholder="Min IC" inputMode="decimal" />
          <input value={max} onChange={event => setMax(event.target.value.replace(/[^\d.]/g, ''))} placeholder="Max IC" inputMode="decimal" />
          <input value={minInterest} onChange={event => setMinInterest(event.target.value.replace(/[^\d]/g, ''))} placeholder="Min interest" inputMode="numeric" />
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

      <section className="tidy-tab-panel bazaar-tools-panel">
        <div className="panel-title-row compact"><div><h3>Saved Filters & Watchlist</h3><p className="muted">Save current Bazaar filters or watch for future matching listings.</p></div></div>
        <div className="tidy-toolbar bazaar-save-toolbar">
          <input value={filterName} onChange={event => setFilterName(event.target.value)} placeholder="Filter name" />
          <button type="button" onClick={saveCurrentFilter}>Save Current Filter</button>
          <input value={watchKeyword} onChange={event => setWatchKeyword(event.target.value)} placeholder="Watch keyword" />
          <button type="button" className="ghost" onClick={addWatch}>Add Watch</button>
        </div>
        <div className="bazaar-tool-columns">
          <div>
            <strong>Saved Filters</strong>
            {savedFilters.length === 0 && <p className="muted">No saved filters yet.</p>}
            {savedFilters.map(filter => <p className="bazaar-tool-pill" key={filter.id}><button type="button" onClick={() => applySavedFilter(filter)}>{filter.name}</button><button type="button" className="danger mini" onClick={() => deleteSavedFilter(filter.id)}>×</button></p>)}
          </div>
          <div>
            <strong>Watchlist</strong>
            {watchlist.length === 0 && <p className="muted">No watched keywords yet.</p>}
            {watchlist.map(watch => <p className="bazaar-tool-pill" key={watch.id}><span>{watch.keyword}{watch.verifiedOnly ? ' · verified only' : ''}</span><button type="button" className="danger mini" onClick={() => deleteWatch(watch.id)}>×</button></p>)}
          </div>
        </div>
      </section>

      <p className="muted tidy-count">{loading ? 'Loading Bazaar...' : `Showing ${items.length} listing${items.length === 1 ? '' : 's'}.`}</p>
      {items.length === 0 && !loading && <p className="muted tidy-empty">No valid IC listings found for recently active players.</p>}

      <div className="bazaar-grid">
        {items.map(item => {
          const verifiedInterestCount = Number(item.interestCount || 0);
          return (
            <article className="bazaar-item-card vt-unified-item-card" key={item.id} data-item-id={item.id || ''} data-id={item.id || ''} data-title={vtText(item.title, 'Item')} data-price={`${formatNumber(item.priceAmount)} IC`} data-owner-id={item.ownerId || item.owner_id || item.userId || item.userid || ''} data-owner-username={item.ownerUsername || ''}>
              <div className="bazaar-image-wrap"><img src={vtText(item.image)} alt={vtText(item.title, 'Item')} /></div>
              <div className="bazaar-item-body">
                <h3>{vtText(item.title, 'Item')}</h3>
                {currentUser?.isAdmin && item.ownerUsername && <p className="bazaar-admin-owner">Owner: <strong>{item.ownerUsername}</strong>{item.ownerVerified && <span className="verified-badge mini" title="Verified user">✓</span>}</p>}
                <strong className="bazaar-price">{formatNumber(item.priceAmount)} IC</strong>
                {item.ownerVerified && !currentUser?.isAdmin && <span className="bazaar-verified-owner"><span className="verified-badge mini" title="Verified user">✓</span> Verified seller</span>}
                <div className="bazaar-interest-row"><span>{verifiedInterestCount} verified user{verifiedInterestCount === 1 ? '' : 's'} interested</span>{item.viewerInterested && <span className="status-pill">you are interested</span>}</div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
