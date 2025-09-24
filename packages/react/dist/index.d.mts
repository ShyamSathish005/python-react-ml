import { UseModelResult, PythonReactML, PythonModel } from '@python-react-ml/core';
import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';

declare function useModel(modelUrl: string): UseModelResult;

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

export { ModelContextValue, ModelLoader, ModelLoaderProps, ModelProviderProps, PythonEngineState, PythonModelProvider, UsePythonEngineOptions, useModel, useModelContext, usePythonEngine };
