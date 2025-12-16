// Runtime types
export type RuntimeType = 'pyodide' | 'onnx' | 'tfjs';

// Model input/output schema
export interface ModelIOSchema {
  name: string;
  type: 'tensor' | 'array' | 'object' | 'string' | 'number' | 'boolean';
  shape?: number[];
  dtype?: 'float32' | 'int32' | 'uint8' | 'bool' | 'string';
  description?: string;
  required?: boolean;
}

export interface PythonModelManifest {
  // Core metadata
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;

  // Runtime specification
  runtime: RuntimeType;

  // Python configuration (for pyodide runtime)
  entrypoint?: string;
  python_version?: string;
  dependencies?: string[];

  // Model file (for onnx/tfjs runtime)
  model_file?: string;

  // Bundle integrity
  bundle_version: string;
  sha256: string;
  created_at: string;

  // Runtime configuration
  runtime_hints: {
    pyodide?: boolean;
    native?: boolean;
    memory_limit?: number;
    timeout?: number;
    gpu_acceleration?: boolean;
    quantized?: boolean;
  };

  // Model I/O specification
  inputs: ModelIOSchema[];
  outputs: ModelIOSchema[];

  // Legacy API specification (for backward compatibility)
  functions?: {
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
  backend?: string;
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
  gpuAcceleration?: boolean;
  onnxOptions?: any;
  tfjsBackend?: string;
  onStatusChange?: (status: RuntimeStatus) => void;
  onProgress?: (progress: number) => void;
  onError?: (error: RuntimeError) => void;
  fallbackUrl?: string;
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
  type: 'initialization' | 'loading' | 'execution' | 'network' | 'timeout' | 'memory' | 'validation';
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

// Multi-Runtime Adapter System
export interface IAdapter {
  readonly runtime: RuntimeType;
  readonly status: RuntimeStatus;

  // Core lifecycle methods
  initialize(options?: AdapterOptions): Promise<void>;
  load(bundle: ModelBundle): Promise<PythonModel>;
  predict(model: PythonModel, inputs: any): Promise<any>;
  unload(model: PythonModel): Promise<void>;
  cleanup(): Promise<void>;

  // Status and error handling
  getStatus(): RuntimeStatus;
  getLastError(): RuntimeError | null;

  // Event handlers
  onStatusChange?(status: RuntimeStatus): void;
  onProgress?(progress: ModelProgress): void;
  onError?(error: RuntimeError): void;
}

export interface AdapterOptions {
  enableLogging?: boolean;
  memoryLimit?: number;
  timeout?: number;
  gpuAcceleration?: boolean;
  // Runtime-specific options
  pyodideUrl?: string; // for PyodideAdapter
  onnxOptions?: any;   // for ONNXAdapter
  tfjsBackend?: string; // for TFJSAdapter
}

export interface AdapterFactory {
  createAdapter(runtime: RuntimeType, options?: AdapterOptions): IAdapter;
  getSupportedRuntimes(): RuntimeType[];
  isRuntimeSupported(runtime: RuntimeType): boolean;
}