export default function UserInventoryPage({
  username,
  userRecord,
  items,
  loading,
  error,
  isLoggedIn,
  loginRequiredMessage,
  onUsernameChange,
  onLoad,
  onBack,
  onStartTrade,
  onLoginRequired
}) {
  const cleanUsername = String(username || '').trim();

  const profileUrl = cleanUsername
    ? `${window.location.origin}${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/user/${encodeURIComponent(cleanUsername)}`
    : '';

  return (
    <section className="card">
      <div className="panel-title-row">
        <div>
          <h2>User Inventory</h2>
          <p className="muted">
            View another player inventory by username or share a direct profile link.
          </p>
        </div>

        {onBack && <button className="ghost" onClick={onBack}>Back</button>}
      </div>

      {loginRequiredMessage && <p className="error">{loginRequiredMessage}</p>}

      <form
        className="inline-controls"
        onSubmit={event => {
          event.preventDefault();
          onLoad(cleanUsername);
        }}
      >
        <input
          value={username}
          onChange={event => onUsernameChange(event.target.value)}
          placeholder="Username"
        />
        <button type="submit">View Inventory</button>
      </form>

      {profileUrl && (
        <div className="inline-controls">
          <input value={profileUrl} readOnly />
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(profileUrl)}
          >
            Copy User Link
          </button>
        </div>
      )}

      {loading && <p className="muted">Loading inventory...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && userRecord && (
        <>
          <div className="panel-title-row">
            <div>
              <h3>{userRecord.username}'s Inventory</h3>
              <span className="status-pill">{items.length} item{items.length === 1 ? '' : 's'}</span>
            </div>

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

            {items.map(item => (
              <div key={item.id} className="item-card readonly">
                <img src={item.image} alt={item.title} />
                <span>{item.title}</span>

                <div className="item-full-preview">
                  <img src={item.image} alt={item.title} />
                  <strong>{item.title}</strong>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !userRecord && !error && (
        <p className="muted">Enter a username to view their inventory.</p>
      )}
    </section>
  );
}
