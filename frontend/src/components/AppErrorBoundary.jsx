import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-crash-screen">
          <section className="card app-crash-card">
            <h1>Something crashed after loading.</h1>
            <p>
              The app caught a frontend error instead of showing a blank screen.
            </p>
            <pre>{this.state.error?.message || String(this.state.error)}</pre>
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
