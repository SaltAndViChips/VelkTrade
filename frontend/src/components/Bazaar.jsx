import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

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

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString();
}

export default function Bazaar({ currentUser }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [verified, setVerified] = useState('all');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [minInterest, setMinInterest] = useState('');
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

  useEffect(() => {
    const timer = window.setTimeout(loadBazaar, 180);
    return () => window.clearTimeout(timer);
  }, [queryString]);

  async function toggleInterest(item) {
    setError('');

    try {
      if (item.viewerInterested) {
        await api(`/api/bazaar/items/${item.id}/interest`, { method: 'DELETE' });
      } else {
        await api(`/api/bazaar/items/${item.id}/interest`, { method: 'POST' });
      }

      await loadBazaar();
    } catch (err) {
      setError(err.message || 'Could not update interest.');
    }
  }

  return (
    <section className="card bazaar-page">
      <div className="panel-title-row">
        <div>
          <h2>Bazaar</h2>
          <p className="muted">
            Valid IC listings from players active within the last 7 days.
          </p>
        </div>

        <button type="button" onClick={loadBazaar}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="tidy-tab-panel bazaar-controls">
        <div className="tidy-toolbar bazaar-toolbar">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={currentUser?.isAdmin ? 'Search by item, IC price, or owner...' : 'Search by item or IC price...'}
          />

          <input
            value={min}
            onChange={event => setMin(event.target.value.replace(/[^\d.]/g, ''))}
            placeholder="Min IC"
            inputMode="decimal"
          />

          <input
            value={max}
            onChange={event => setMax(event.target.value.replace(/[^\d.]/g, ''))}
            placeholder="Max IC"
            inputMode="decimal"
          />

          <input
            value={minInterest}
            onChange={event => setMinInterest(event.target.value.replace(/[^\d]/g, ''))}
            placeholder="Min interest"
            inputMode="numeric"
          />
        </div>

        <div className="bazaar-filter-row">
          <div className="segmented-control compact bazaar-sort-tabs">
            {SORTS.map(option => (
              <button
                type="button"
                key={option.key}
                className={sort === option.key ? 'active' : ''}
                onClick={() => setSort(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="segmented-control compact bazaar-verified-tabs">
            {VERIFIED_FILTERS.map(option => (
              <button
                type="button"
                key={option.key}
                className={verified === option.key ? 'active' : ''}
                onClick={() => setVerified(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <p className="muted tidy-count">
        {loading ? 'Loading Bazaar...' : `Showing ${items.length} listing${items.length === 1 ? '' : 's'}.`}
      </p>

      {items.length === 0 && !loading && (
        <p className="muted tidy-empty">
          No valid IC listings found for recently active players.
        </p>
      )}

      <div className="bazaar-grid">
        {items.map(item => {
          const otherInterestCount = Math.max(
            0,
            Number(item.interestCount || 0) - (item.viewerInterested ? 1 : 0)
          );

          return (
            <article className="bazaar-item-card" key={item.id}>
              <div className="bazaar-image-wrap">
                <img src={item.image} alt={item.title} />
              </div>

              <div className="bazaar-item-body">
                <h3>{item.title}</h3>

                {currentUser?.isAdmin && item.ownerUsername && (
                  <p className="bazaar-admin-owner">
                    Owner: <strong>{item.ownerUsername}</strong>
                    {item.ownerVerified && <span className="verified-badge mini" title="Verified user">✓</span>}
                  </p>
                )}

                <strong className="bazaar-price">{formatNumber(item.priceAmount)} IC</strong>

                {item.ownerVerified && !currentUser?.isAdmin && (
                  <span className="bazaar-verified-owner">
                    <span className="verified-badge mini" title="Verified user">✓</span> Verified seller
                  </span>
                )}

                <div className="bazaar-interest-row">
                  <span>{otherInterestCount} other user{otherInterestCount === 1 ? '' : 's'} interested</span>
                  {item.viewerInterested && <span className="status-pill">you are interested</span>}
                </div>

                <button
                  type="button"
                  disabled={item.isOwnItem}
                  className={item.viewerInterested ? 'mini-danger' : ''}
                  onClick={() => toggleInterest(item)}
                >
                  {item.isOwnItem
                    ? 'Your Item'
                    : item.viewerInterested
                      ? 'Remove Interest'
                      : 'Interested'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
