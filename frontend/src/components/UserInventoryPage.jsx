function addThousandsCommas(numberText) {
  const [whole, decimal] = String(numberText).replace(/,/g, '').split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal !== undefined ? `${withCommas}.${decimal}` : withCommas;
}

function formatPriceDisplay(price) {
  const clean = String(price || '').trim();
  if (!clean) return '';

  const withoutDollar = clean.replace(/^\$\s*/, '').trim();
  const withoutIc = withoutDollar.replace(/\bic\b/ig, '').trim();

  if (/^\d+(\.\d+)?$/.test(withoutIc.replace(/,/g, ''))) {
    return `${addThousandsCommas(withoutIc)} IC`;
  }

  if (/^\d+(\.\d+)?\s*[kmb]$/i.test(withoutIc)) {
    return `${withoutIc} IC`;
  }

  if (/\bic\b/i.test(withoutDollar)) {
    return withoutDollar.replace(/\bic\b/i, 'IC');
  }

  return withoutDollar;
}

function getBackendShareBase() {
  return (import.meta.env.VITE_API_URL || 'https://velktrade.onrender.com').replace(/\/$/, '');
}

function getFrontendProfileUrl(username) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${window.location.origin}${cleanBase}/user/${encodeURIComponent(username)}`;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
}

export default function UserInventoryPage({
  username,
  userRecord,
  items,
  loading,
  error,
  isLoggedIn,
  currentUsername,
  loginRequiredMessage,
  onLoad,
  onStartTrade,
  onLoginRequired,
  onToggleBuyRequest
}) {
  const profileUrl = userRecord ? getFrontendProfileUrl(userRecord.username) : '';
  const discordShareUrl = userRecord
    ? `${getBackendShareBase()}/u/${encodeURIComponent(userRecord.username)}?v=${Date.now()}`
    : '';

  return (
    <>

      {loginRequiredMessage && <p className="error">{loginRequiredMessage}</p>}

      {loading && <p className="muted">Loading inventory...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && userRecord && (
        <>
          <div className="profile-header">
            <div>
              <h3>
                {userRecord.username}'s Inventory{' '}
                {userRecord.online ? (
                  <span className="online-status">Online</span>
                ) : (
                  <span className="offline-status">Offline</span>
                )}
              </h3>
              <span className="status-pill">{items.length} item{items.length === 1 ? '' : 's'} listed</span>
            </div>

            {userRecord.bio ? (
              <p className="profile-bio">{userRecord.bio}</p>
            ) : (
              <p className="muted">No bio yet.</p>
            )}

            <div className="profile-action-row">
              <button
                type="button"
                onClick={() => {
                  if (isLoggedIn) {
                    onStartTrade(userRecord.username);
                  } else {
                    onLoginRequired(userRecord.username);
                  }
                }}
              >
                Trade
              </button>

              <button
                type="button"
                className="profile-share-icon-button ghost"
                onClick={() => copyText(discordShareUrl)}
                title="Copy Discord/social preview link"
                aria-label="Copy Discord/social preview link"
              >
                ↗
              </button>
            </div>
          </div>

          <div className="card profile-items-card">
            <div className="item-grid drop-zone">
              {items.length === 0 && <p className="muted">This player has no items.</p>}

            {items.map(item => {
              const isOwnProfile = String(currentUsername || '').toLowerCase() === String(userRecord.username || '').toLowerCase();
              const displayPrice = formatPriceDisplay(item.price);

              return (
                <div key={item.id} className="item-card readonly">
                  <img src={item.image} alt={item.title} />
                  <span>{item.title}</span>
                  {displayPrice ? <strong className="item-price">{displayPrice}</strong> : <small className="muted">No IC price set</small>}
                  <small className="muted">{item.buyRequestCount || 0} buy request{Number(item.buyRequestCount || 0) === 1 ? '' : 's'}</small>

                  <div className="item-full-preview">
                    <img src={item.image} alt={item.title} />
                    <strong>{item.title}</strong>
                    {displayPrice && <em>{displayPrice}</em>}
                  </div>

                  {!isOwnProfile && (
                    <button
                      type="button"
                      className={item.viewerWouldBuy ? 'mini-danger' : 'mini-action'}
                      onClick={() => {
                        if (!isLoggedIn) {
                          onLoginRequired(userRecord.username);
                        } else {
                          onToggleBuyRequest(item);
                        }
                      }}
                    >
                      {item.viewerWouldBuy ? 'Remove Buy Request' : 'Would Buy'}
                    </button>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </>
      )}

      {!loading && !userRecord && !error && (
        <div className="inline-controls">
          <button type="button" onClick={() => onLoad(username)}>
            Load Inventory
          </button>
        </div>
      )}
    </>
  );
}
