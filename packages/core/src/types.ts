export interface PythonModelManifest {
  name: string;
  version: string;
  entry: string;
  python_version?: string;
  dependencies?: string[];
  runtime_hints?: {
    pyodide?: boolean;
    native?: boolean;
  };
  sha256?: string;
}

export interface PythonModel {
  manifest: PythonModelManifest;
  predict: (input: any) => Promise<any>;
  getInfo?: () => Promise<any>;
  cleanup?: () => void;
}

export interface ModelBundle {
  manifest: PythonModelManifest;
  code: string;
  files?: Record<string, ArrayBuffer>;
}

export interface PythonEngineOptions {
  platform: 'web' | 'native';
  pyodideUrl?: string;
  enableLogging?: boolean;
}

export interface ModelLoadOptions {
  modelUrl?: string;
  entry?: string;
  runtime?: 'auto' | 'pyodide' | 'native';
}

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseModelResult {
  model: PythonModel | null;
  status: ModelStatus;
  error: string | null;
  predict: (input: any) => Promise<any>;
  reload: () => Promise<void>;
}