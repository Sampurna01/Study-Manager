import { Component, type ReactNode } from "react";

/** Shows what went wrong instead of a blank page if the app crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center" style={{ padding: "0 16px" }}>
        <h1>Something went wrong</h1>
        <p className="muted">Copy the message below if you're asking for help.</p>
        <pre className="banner error pre" style={{ maxWidth: 640, overflowX: "auto" }}>
          {this.state.error.message}
        </pre>
        <button className="btn" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
