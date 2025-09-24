import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PythonReactML } from '@python-react-ml/core';
import type { ModelContextValue, ModelProviderProps } from '../types';

const ModelContext = createContext<ModelContextValue | undefined>(undefined);

export function PythonModelProvider({ 
  children, 
  pyodideUrl, 
  enableLogging = false 
}: ModelProviderProps) {
  const [engine] = useState(() => new PythonReactML({ 
    platform: 'web', 
    pyodideUrl,
    enableLogging 
  }));
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadModel = async (url: string) => {
    try {
      setError(null);
      return await engine.loadModelFromBundle(url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load model';
      setError(errorMessage);
      throw err;
    }
  };

  useEffect(() => {
    // Engine initialization is handled internally
    setIsInitialized(true);

    return () => {
      engine.cleanup();
    };
  }, [engine]);

  const contextValue: ModelContextValue = {
    engine,
    loadModel,
    isInitialized,
    error
  };

  return (
    <ModelContext.Provider value={contextValue}>
      {children}
    </ModelContext.Provider>
  );
}

export function useModelContext(): ModelContextValue {
  const context = useContext(ModelContext);
  if (!context) {
    throw new Error('useModelContext must be used within a PythonModelProvider');
  }
  return context;
}