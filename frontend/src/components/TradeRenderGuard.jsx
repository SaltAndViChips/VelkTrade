import React from 'react';

function safeNode(value) {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => <React.Fragment key={index}>{safeNode(entry)}</React.Fragment>);
  }
  if (typeof value === 'object') {
    if (typeof value.title === 'string') return value.title;
    if (typeof value.name === 'string') return value.name;
    if (typeof value.username === 'string') return value.username;
    if (typeof value.message === 'string') return value.message;
    try {
      const json = JSON.stringify(value);
      return json && json !== '{}' ? json : '';
    } catch {
      return '';
    }
  }
  return '';
}

class TradeRenderGuard extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('TradeRenderGuard caught frontend render error:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="card trade-render-guard-card">
          <h2>Trade view failed to render safely.</h2>
          <p className="muted">
            A trade record contains an object where text was expected. Refresh after the latest patch deploys.
          </p>
          <pre>{safeNode(this.state.error?.message)}</pre>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

export default TradeRenderGuard;
