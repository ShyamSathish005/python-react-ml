import { ModelError, RuntimeError, ModelProgress, UseModelResult, PythonReactML, PythonModel } from '@python-react-ml/core';
export { ModelBundle, ModelError, ModelProgress, ModelStatus, PythonModel, PythonModelManifest, RuntimeError, RuntimeStatus } from '@python-react-ml/core';
import * as react_jsx_runtime from 'react/jsx-runtime';
import React, { ReactNode, Component, ErrorInfo } from 'react';

interface UseModelOptions {
    /** Auto-load model when URL changes */
    autoLoad?: boolean;
    /** Retry loading on failure */
    retryOnError?: boolean;
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Custom error handler */
    onError?: (error: ModelError | RuntimeError) => void;
    /** Progress callback */
    onProgress?: (progress: ModelProgress) => void;
    /** Python engine platform */
    platform?: 'web' | 'native';
    /** Pyodide URL for web platform */
    pyodideUrl?: string;
    /** Enable logging */
    enableLogging?: boolean;
    /** Memory limit */
    memoryLimit?: number;
    /** Operation timeout */
    timeout?: number;
}
declare function useModel(modelUrl: string, options?: UseModelOptions): UseModelResult;

interface UsePythonEngineOptions {
    pyodideUrl?: string;
    enableLogging?: boolean;
}
interface PythonEngineState {
    engine: PythonReactML | null;
    isInitialized: boolean;
    isLoading: boolean;
    error: string | null;
}
declare function usePythonEngine(options?: UsePythonEngineOptions): {
    initialize: () => Promise<void>;
    cleanup: () => Promise<void>;
    engine: PythonReactML | null;
    isInitialized: boolean;
    isLoading: boolean;
    error: string | null;
};

interface ModelContextValue {
    engine: any;
    loadModel: (url: string) => Promise<PythonModel>;
    isInitialized: boolean;
    error: string | null;
}
interface ModelProviderProps {
    children: ReactNode;
    pyodideUrl?: string;
    enableLogging?: boolean;
}
interface ModelLoaderProps {
    modelUrl: string;
    onLoad?: (model: PythonModel) => void;
    onError?: (error: Error) => void;
    children?: (result: UseModelResult) => ReactNode;
}

declare function PythonModelProvider({ children, pyodideUrl, enableLogging }: ModelProviderProps): react_jsx_runtime.JSX.Element;
declare function useModelContext(): ModelContextValue;

declare function ModelLoader({ modelUrl, onLoad, onError, children }: ModelLoaderProps): react_jsx_runtime.JSX.Element;

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
declare class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps);
    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState>;
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
    componentDidUpdate(prevProps: ErrorBoundaryProps): void;
    render(): string | number | boolean | Iterable<React.ReactNode> | react_jsx_runtime.JSX.Element;
}
/**
 * Specialized Error Boundary for Python ML model operations
 */
declare class ModelErrorBoundary extends Component<ModelErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ModelErrorBoundaryProps);
    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState>;
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
    private isModelError;
    private createModelError;
    componentDidUpdate(prevProps: ModelErrorBoundaryProps): void;
    render(): string | number | boolean | Iterable<React.ReactNode> | react_jsx_runtime.JSX.Element;
}
declare function withErrorBoundary<P extends object>(Component: React.ComponentType<P>, errorBoundaryConfig?: Omit<ErrorBoundaryProps, 'children'>): {
    (props: P): react_jsx_runtime.JSX.Element;
    displayName: string;
};
declare function withModelErrorBoundary<P extends object>(Component: React.ComponentType<P>, errorBoundaryConfig?: Omit<ModelErrorBoundaryProps, 'children'>): {
    (props: P): react_jsx_runtime.JSX.Element;
    displayName: string;
};

export { ErrorBoundary, ModelContextValue, ModelErrorBoundary, ModelLoader, ModelLoaderProps, ModelProviderProps, PythonEngineState, PythonModelProvider, UseModelOptions, UsePythonEngineOptions, useModel, useModelContext, usePythonEngine, withErrorBoundary, withModelErrorBoundary };
