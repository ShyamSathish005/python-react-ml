import React, { Component, ReactNode, ErrorInfo } from 'react';
import { ModelError } from '@python-react-ml/core';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: ErrorInfo | null) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: any[];
}

interface ModelErrorBoundaryProps extends ErrorBoundaryProps {
  onModelError?: (error: ModelError) => void;
}

/**
 * Generic Error Boundary for catching JavaScript errors in React components
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Call custom error handler
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Boundary caught an error:', error);
      console.error('Error Info:', errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    // Reset error state when specified props change
    if (hasError && resetOnPropsChange) {
      const hasChanged = resetOnPropsChange.some((prop, index) => 
        prop !== (prevProps.resetOnPropsChange?.[index])
      );

      if (hasChanged) {
        this.setState({
          hasError: false,
          error: null,
          errorInfo: null
        });
      }
    }
  }

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      // Custom fallback UI
      if (fallback) {
        return fallback(error, errorInfo);
      }

      // Default error UI
      return (
        <div style={{ 
          padding: '20px', 
          border: '1px solid #ff6b6b', 
          borderRadius: '4px', 
          backgroundColor: '#ffe0e0',
          margin: '10px 0' 
        }}>
          <h2 style={{ color: '#d63031', marginTop: 0 }}>Something went wrong</h2>
          <p style={{ color: '#2d3436' }}>
            <strong>Error:</strong> {error.message}
          </p>
          {process.env.NODE_ENV === 'development' && errorInfo && (
            <details style={{ marginTop: '10px' }}>
              <summary style={{ cursor: 'pointer', color: '#636e72' }}>
                Error Details (Development)
              </summary>
              <pre style={{ 
                whiteSpace: 'pre-wrap', 
                fontSize: '12px', 
                color: '#636e72',
                marginTop: '10px',
                overflow: 'auto'
              }}>
                {error.stack}
                {errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return children;
  }
}

/**
 * Specialized Error Boundary for Python ML model operations
 */
export class ModelErrorBoundary extends Component<ModelErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ModelErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Handle model-specific errors
    if (this.isModelError(error)) {
      const modelError: ModelError = this.createModelError(error);
      this.props.onModelError?.(modelError);
    }

    // Call generic error handler
    this.props.onError?.(error, errorInfo);
  }

  private isModelError(error: Error): boolean {
    const modelErrorPatterns = [
      /model not loaded/i,
      /prediction failed/i,
      /pyodide/i,
      /python/i,
      /worker/i
    ];

    return modelErrorPatterns.some(pattern => 
      pattern.test(error.message) || pattern.test(error.name)
    );
  }

  private createModelError(error: Error): ModelError {
    let errorType: ModelError['type'] = 'runtime';

    if (error.message.includes('network') || error.message.includes('fetch')) {
      errorType = 'network';
    } else if (error.message.includes('timeout')) {
      errorType = 'timeout';
    } else if (error.message.includes('validation')) {
      errorType = 'validation';
    } else if (error.message.includes('python')) {
      errorType = 'python';
    }

    return {
      type: errorType,
      message: error.message,
      timestamp: new Date().toISOString(),
      stack: error.stack,
      details: error
    };
  }

  componentDidUpdate(prevProps: ModelErrorBoundaryProps) {
    const { resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError && resetOnPropsChange) {
      const hasChanged = resetOnPropsChange.some((prop, index) => 
        prop !== (prevProps.resetOnPropsChange?.[index])
      );

      if (hasChanged) {
        this.setState({
          hasError: false,
          error: null,
          errorInfo: null
        });
      }
    }
  }

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      if (fallback) {
        return fallback(error, errorInfo);
      }

      // Model-specific error UI
      return (
        <div style={{
          padding: '20px',
          border: '1px solid #e17055',
          borderRadius: '8px',
          backgroundColor: '#fff5f5',
          margin: '10px 0',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '24px', marginRight: '10px' }}>⚠️</span>
            <h3 style={{ color: '#d63031', margin: 0 }}>Model Error</h3>
          </div>
          
          <p style={{ color: '#2d3436', marginBottom: '15px' }}>
            There was an issue with the Python ML model:
          </p>
          
          <div style={{
            padding: '12px',
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#e17055'
          }}>
            {error.message}
          </div>

          <div style={{ marginTop: '15px', fontSize: '14px', color: '#636e72' }}>
            <p>This might be caused by:</p>
            <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
              <li>Network connectivity issues</li>
              <li>Invalid model format or code</li>
              <li>Missing Python dependencies</li>
              <li>Browser compatibility issues</li>
            </ul>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '15px' }}>
              <summary style={{ cursor: 'pointer', color: '#636e72' }}>
                Technical Details (Development)
              </summary>
              <pre style={{
                whiteSpace: 'pre-wrap',
                fontSize: '11px',
                color: '#636e72',
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#f8f9fa',
                border: '1px solid #e9ecef',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '200px'
              }}>
                {error.stack}
                {errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return children;
  }
}

// HOC for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryConfig?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryConfig}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}

export function withModelErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryConfig?: Omit<ModelErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ModelErrorBoundary {...errorBoundaryConfig}>
      <Component {...props} />
    </ModelErrorBoundary>
  );

  WrappedComponent.displayName = `withModelErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}