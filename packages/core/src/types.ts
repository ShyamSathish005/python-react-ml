export interface PythonModelManifest {
  // Core metadata
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  
  // Python configuration
  entrypoint: string;
  python_version: string;
  dependencies: string[];
  
  // Bundle integrity
  bundle_version: string;
  sha256: string;
  created_at: string;
  
  // Runtime configuration
  runtime_hints: {
    pyodide: boolean;
    native: boolean;
    memory_limit?: number;
    timeout?: number;
  };
  
  // API specification
  functions: {
    [key: string]: {
      description?: string;
      inputs: { [key: string]: string };
      outputs: { [key: string]: string };
    };
  };
  
  // File manifest
  files: {
    [path: string]: {
      size: number;
      sha256: string;
      type: 'python' | 'data' | 'other';
    };
  };
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
  memoryLimit?: number;
  timeout?: number;
  onStatusChange?: (status: RuntimeStatus) => void;
  onProgress?: (progress: number) => void;
  onError?: (error: RuntimeError) => void;
}

export type RuntimeStatus = 
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'loading'
  | 'executing'
  | 'error'
  | 'terminated';

export interface RuntimeError {
  type: 'initialization' | 'loading' | 'execution' | 'network' | 'timeout' | 'memory';
  message: string;
  details?: any;
  timestamp: string;
  stack?: string;
  pythonTraceback?: string;
}

export type ModelStatus = 
  | 'idle'
  | 'downloading' 
  | 'validating'
  | 'loading'
  | 'ready'
  | 'error'
  | 'unloading';

export interface ModelError {
  type: 'network' | 'validation' | 'runtime' | 'python' | 'timeout';
  message: string;
  details?: any;
  timestamp: string;
  stack?: string;
  pythonTraceback?: string;
}

export interface ModelProgress {
  status: ModelStatus;
  progress?: number; // 0-100
  message?: string;
  error?: ModelError;
}

export interface ModelLoadOptions {
  modelUrl?: string;
  entry?: string;
  runtime?: 'auto' | 'pyodide' | 'native';
}

export interface UseModelResult {
  model: PythonModel | null;
  status: ModelStatus;
  error: ModelError | null;
  predict: (input: any) => Promise<any>;
  unload: () => Promise<void>;
  reload: () => Promise<void>;
  progress: ModelProgress;
  // Enhanced state information
  isLoading?: boolean;
  isPredicting?: boolean;
  isReady?: boolean;
  hasError?: boolean;
  // Enhanced actions
  load?: (url?: string) => Promise<void>;
  clearError?: () => void;
}

// WebWorker Message Protocol
export interface WorkerMessage {
  id: string;
  type: 'init' | 'loadModel' | 'predict' | 'unload' | 'status';
  payload?: any;
}

export interface WorkerResponse {
  id: string;
  type: 'initialized' | 'progress' | 'loaded' | 'predicted' | 'unloaded' | 'error';
  payload?: any;
  error?: RuntimeError;
  progress?: ModelProgress;
}