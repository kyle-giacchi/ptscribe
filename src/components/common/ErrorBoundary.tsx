import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100dvh',
            padding: '24px',
            background: 'var(--color-surface)',
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: '100%',
              padding: '32px 28px',
              borderRadius: 16,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'color-mix(in oklab, var(--color-negative) 12%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 22,
              }}
              aria-hidden
            >
              ⚠
            </div>
            <h1
              style={{
                margin: '0 0 8px',
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--color-fg)',
                letterSpacing: '-0.2px',
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                margin: '0 0 24px',
                fontSize: 14,
                color: 'var(--color-fg-muted)',
                lineHeight: 1.5,
              }}
            >
              An unexpected error occurred. Your data is safe — reloading the page should fix this.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px 20px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-fg)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
