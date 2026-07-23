import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

// Catches render/lifecycle errors that would otherwise white-screen the app.
// Logs the full error to the console AND shows the details on screen with a
// copy button, so the user can copy the error and paste it into the chat to
// get it fixed.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] React render error:', error);
    console.error('[app] Component stack:', info.componentStack);
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  private buildReport(): string {
    const { error, componentStack } = this.state;
    return [
      `Error: ${error?.message ?? 'Unknown error'}`,
      '',
      'Stack:',
      error?.stack ?? '(no stack)',
      '',
      'Component stack:',
      componentStack || '(no component stack)',
    ].join('\n');
  }

  private handleCopy = async (): Promise<void> => {
    const report = this.buildReport();
    try {
      await navigator.clipboard.writeText(report);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context) — select-all fallback.
      const ta = document.createElement('textarea');
      ta.value = report;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }
  };

  render(): ReactNode {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 900,
          margin: '40px auto',
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: 8, color: '#b91c1c' }}>
          应用出错了 / Something went wrong
        </h1>
        <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>
          复制下面的错误信息，粘贴到对话里，我来帮你修复。
          <br />
          Copy the error below and paste it into the chat to get it fixed.
        </p>
        <button
          type="button"
          onClick={this.handleCopy}
          style={{
            marginBottom: 12,
            padding: '6px 14px',
            fontSize: 14,
            cursor: 'pointer',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: copied ? '#16a34a' : '#111827',
            color: '#ffffff',
          }}
        >
          {copied ? '已复制 / Copied' : '复制错误信息 / Copy error'}
        </button>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
            color: '#111827',
            maxHeight: 400,
            overflow: 'auto',
          }}
        >
          {this.buildReport()}
        </pre>
      </div>
    );
  }
}
