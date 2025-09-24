import { ReactNode } from 'react';
import type { PythonModel, ModelStatus, UseModelResult } from '@python-react-ml/core';

export interface ModelContextValue {
  engine: any;
  loadModel: (url: string) => Promise<PythonModel>;
  isInitialized: boolean;
  error: string | null;
}

export interface ModelProviderProps {
  children: ReactNode;
  pyodideUrl?: string;
  enableLogging?: boolean;
}

export interface ModelLoaderProps {
  modelUrl: string;
  onLoad?: (model: PythonModel) => void;
  onError?: (error: Error) => void;
  children?: (result: UseModelResult) => ReactNode;
}