import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            maxWidth: '520px',
            margin: '64px auto',
            padding: '24px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '8px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '0.84375rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            {this.state.error?.message || 'An unexpected error occurred while rendering the page.'}
          </p>
          <button
            type="button"
            className="hn-btn hn-btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
