import React, { Component } from 'react';

/**
 * ErrorBoundary — Catches unhandled React rendering errors and shows
 * a graceful fallback UI instead of a blank screen.
 *
 * Wrap <App /> with this at the root to prevent white-screen-of-death.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // In production, send this to Sentry / LogRocket / similar
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-sunken p-8">
          <div className="text-center max-w-md space-y-4">
            <div className="w-16 h-16 mx-auto rounded-surface flex items-center justify-center">
              <svg className="w-8 h-8 text-ink" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-ink">Something went wrong</h2>
            <p className="text-sm text-ink-2 leading-relaxed">
              The page couldn’t be displayed. Refresh to try again.
            </p>
            <button
              className="btn btn-ghost"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
            {import.meta.env.DEV && this.state.error && (
              <details className="text-left mt-4 p-4 rounded-surface bg-sunken text-xs text-muted font-mono">
                <summary className="cursor-pointer font-semibold mb-2">Error Details</summary>
                <pre className="whitespace-pre-wrap break-words">{this.state.error.toString()}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
