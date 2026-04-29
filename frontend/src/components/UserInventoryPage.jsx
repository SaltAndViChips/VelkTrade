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
  onBack,
  onStartTrade,
  onLoginRequired,
  onToggleBuyRequest
}) {
  return (
    <section className="card">
      <div className="panel-title-row">
        <div>
          <h2>User Inventory</h2>
        </div>

        {onBack && <button className="ghost" onClick={onBack}>Back</button>}
      </div>

      {loginRequiredMessage && <p className="error">{loginRequiredMessage}</p>}

      {loading && <p className="muted">Loading inventory...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && userRecord && (
        <>
          <div className="profile-header">
            <div>
              <h3>{userRecord.username}'s Inventory</h3>
              <span className="status-pill">{items.length} item{items.length === 1 ? '' : 's'}</span>
            </div>

            {userRecord.bio ? (
              <p className="profile-bio">{userRecord.bio}</p>
            ) : (
              <p className="muted">No bio yet.</p>
            )}

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
              Start Trade with {userRecord.username}
            </button>
          </div>

          <div className="item-grid drop-zone">
            {items.length === 0 && <p className="muted">This player has no items.</p>}

            {items.map(item => {
              const isOwnProfile = String(currentUsername || '').toLowerCase() === String(userRecord.username || '').toLowerCase();

              return (
                <div key={item.id} className="item-card readonly">
                  <img src={item.image} alt={item.title} />
                  <span>{item.title}</span>
                  {item.price ? <strong className="item-price">{item.price}</strong> : <small className="muted">No price set</small>}
                  <small className="muted">{item.buyRequestCount || 0} buy request{Number(item.buyRequestCount || 0) === 1 ? '' : 's'}</small>

                  <div className="item-full-preview">
                    <img src={item.image} alt={item.title} />
                    <strong>{item.title}</strong>
                    {item.price && <em>{item.price}</em>}
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
        </>
      )}

      {!loading && !userRecord && !error && (
        <div className="inline-controls">
          <button type="button" onClick={() => onLoad(username)}>
            Load Inventory
          </button>
        </div>
      )}
    </section>
  );
}
