import { PythonReactML, PythonModel as PythonModel$1, UseModelResult, ModelError as ModelError$1 } from 'python-react-ml';
export { DeviceCapabilities, ExplainabilityMethod, ExtendedRuntimeType, InferenceMetrics, ModelBundle, ModelError, ModelExplanation, ModelProgress, ModelStatus, MonitoringOptions, OptimizationOptions, PrivacyOptions, PythonModel, PythonModelManifest, RealtimeOptions, RegistryOptions, RuntimeError, RuntimeStatus, WebGPUCapabilities } from 'python-react-ml';
import { ExtendedRuntimeType, OptimizationOptions, RegistryOptions, PrivacyOptions, MonitoringOptions, RealtimeOptions, ModelError, PythonModel, ModelStatus, ModelExplanation, InferenceMetrics } from '@python-react-ml/core';
import * as react_jsx_runtime from 'react/jsx-runtime';
import React, { ReactNode, Component, ErrorInfo } from 'react';

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

/**
 * Enhanced useModel Hook for Phase 2.5
 *
 * Supports all Phase 2.5 features:
 * - Auto-optimization
 * - Model registry
 * - Privacy features
 * - Monitoring & explainability
 * - Real-time mode
 */

interface UseModelEnhancedOptions {
    runtime?: ExtendedRuntimeType;
    platform?: 'web' | 'native';
    autoLoad?: boolean;
    optimization?: OptimizationOptions;
    registry?: RegistryOptions;
    privacy?: PrivacyOptions;
    monitoring?: MonitoringOptions;
    realtime?: RealtimeOptions;
    onError?: (error: ModelError) => void;
    onReady?: () => void;
    onDriftDetected?: (severity: string) => void;
}
interface UseModelEnhancedResult {
    model: PythonModel | null;
    status: ModelStatus;
    error: ModelError | null;
    predict: (input: any, options?: PredictOptions) => Promise<any>;
    predictSync: (input: any) => any | null;
    unload: () => Promise<void>;
    reload: () => Promise<void>;
    explain: (input: any, method?: string) => Promise<ModelExplanation | null>;
    profile: () => Promise<any>;
    optimize: () => Promise<any>;
    getMetrics: () => InferenceMetrics | null;
    getPrivacyGuarantee: () => any;
    isReady: boolean;
    isLoading: boolean;
    isPredicting: boolean;
    isOptimized: boolean;
    metrics: InferenceMetrics | null;
    version: string | null;
}
interface PredictOptions {
    explain?: boolean;
    profile?: boolean;
    timeout?: number;
    priority?: 'low' | 'normal' | 'high';
}
/**
 * Enhanced useModel hook with Phase 2.5 features
 */
declare function useModelEnhanced(modelUrl: string, options?: UseModelEnhancedOptions): UseModelEnhancedResult;

interface ModelContextValue {
    engine: any;
    loadModel: (url: string) => Promise<PythonModel$1>;
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
    onLoad?: (model: PythonModel$1) => void;
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
    onModelError?: (error: ModelError$1) => void;
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

export { ErrorBoundary, ModelContextValue, ModelErrorBoundary, ModelLoader, ModelLoaderProps, ModelProviderProps, PythonEngineState, PythonModelProvider, UseModelEnhancedOptions, UseModelEnhancedResult, UsePythonEngineOptions, useModelEnhanced as useModel, useModelContext, useModelEnhanced, usePythonEngine, withErrorBoundary, withModelErrorBoundary };
