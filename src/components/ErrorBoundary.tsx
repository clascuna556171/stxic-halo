import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[STXIC Halo] UI render boundary caught an error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="app-frame collapsed" role="alert">
        <div className="island">
          <div className="error-recovery-banner">
            <div className="error-recovery-copy">
              <AlertTriangle size={15} />
              <div>
                <strong>Console render fault recovered</strong>
                <p className="tabular">{this.state.message || 'Unexpected UI state'}</p>
              </div>
            </div>
            <button type="button" className="inline-action" onClick={this.handleReset}>
              <RotateCcw size={12} /> Reset HUD
            </button>
          </div>
        </div>
      </div>
    );
  }
}
