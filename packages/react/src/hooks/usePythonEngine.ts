import { useState, useEffect, useCallback, useRef } from 'react';
import { PythonReactML } from 'python-react-ml';

export interface UsePythonEngineOptions {
  pyodideUrl?: string;
  enableLogging?: boolean;
}

export interface PythonEngineState {
  engine: PythonReactML | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

export function usePythonEngine(options: UsePythonEngineOptions = {}) {
  const [state, setState] = useState<PythonEngineState>({
    engine: null,
    isInitialized: false,
    isLoading: false,
    error: null
  });

  const engineRef = useRef<PythonReactML | null>(null);

  const initialize = useCallback(async () => {
    if (engineRef.current) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const engine = new PythonReactML({
        platform: 'web',
        pyodideUrl: options.pyodideUrl,
        enableLogging: options.enableLogging
      });

      engineRef.current = engine;

      setState(prev => ({
        ...prev,
        engine,
        isInitialized: true,
        isLoading: false
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Python engine';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }));
      console.error('Python engine initialization failed:', err);
    }
  }, [options.pyodideUrl, options.enableLogging]);

  const cleanup = useCallback(async () => {
    if (engineRef.current) {
      await engineRef.current.cleanup();
      engineRef.current = null;
    }
    setState({
      engine: null,
      isInitialized: false,
      isLoading: false,
      error: null
    });
  }, []);

  useEffect(() => {
    initialize();

    return () => {
      cleanup();
    };
  }, [initialize]);

  return {
    ...state,
    initialize,
    cleanup
  };
}