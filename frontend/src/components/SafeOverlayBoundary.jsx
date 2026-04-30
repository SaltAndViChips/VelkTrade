import { Component } from 'react';

export default class SafeOverlayBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Overlay crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="overlay-fallback">
          <strong>Menu unavailable</strong>
          <small>Reload the page if the online menu does not return.</small>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
