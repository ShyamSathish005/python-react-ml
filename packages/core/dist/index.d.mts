interface PythonModelManifest {
    name: string;
    version: string;
    description?: string;
    author?: string;
    license?: string;
    entrypoint: string;
    python_version: string;
    dependencies: string[];
    bundle_version: string;
    sha256: string;
    created_at: string;
    runtime_hints: {
        pyodide: boolean;
        native: boolean;
        memory_limit?: number;
        timeout?: number;
    };
    functions: {
        [key: string]: {
            description?: string;
            inputs: {
                [key: string]: string;
            };
            outputs: {
                [key: string]: string;
            };
        };
    };
    files: {
        [path: string]: {
            size: number;
            sha256: string;
            type: 'python' | 'data' | 'other';
        };
    };
}
interface PythonModel {
    manifest: PythonModelManifest;
    predict: (input: any) => Promise<any>;
    getInfo?: () => Promise<any>;
    cleanup?: () => void;
}
interface ModelBundle {
    manifest: PythonModelManifest;
    code: string;
    files?: Record<string, ArrayBuffer>;
}
interface PythonEngineOptions {
    platform: 'web' | 'native';
    pyodideUrl?: string;
    enableLogging?: boolean;
    memoryLimit?: number;
    timeout?: number;
    onStatusChange?: (status: RuntimeStatus) => void;
    onProgress?: (progress: number) => void;
    onError?: (error: RuntimeError) => void;
}
type RuntimeStatus = 'idle' | 'initializing' | 'ready' | 'loading' | 'executing' | 'error' | 'terminated';
interface RuntimeError {
    type: 'initialization' | 'loading' | 'execution' | 'network' | 'timeout' | 'memory';
    message: string;
    details?: any;
    timestamp: string;
    stack?: string;
    pythonTraceback?: string;
}
type ModelStatus = 'idle' | 'downloading' | 'validating' | 'loading' | 'ready' | 'error' | 'unloading';
interface ModelError {
    type: 'network' | 'validation' | 'runtime' | 'python' | 'timeout';
    message: string;
    details?: any;
    timestamp: string;
    stack?: string;
    pythonTraceback?: string;
}
interface ModelProgress {
    status: ModelStatus;
    progress?: number;
    message?: string;
    error?: ModelError;
}
interface ModelLoadOptions {
    modelUrl?: string;
    entry?: string;
    runtime?: 'auto' | 'pyodide' | 'native';
}
interface UseModelResult {
    model: PythonModel | null;
    status: ModelStatus;
    error: ModelError | null;
    predict: (input: any) => Promise<any>;
    unload: () => Promise<void>;
    reload: () => Promise<void>;
    progress: ModelProgress;
    isLoading?: boolean;
    isPredicting?: boolean;
    isReady?: boolean;
    hasError?: boolean;
    load?: (url?: string) => Promise<void>;
    clearError?: () => void;
}
interface WorkerMessage {
    id: string;
    type: 'init' | 'loadModel' | 'predict' | 'unload' | 'status';
    payload?: any;
}
interface WorkerResponse {
    id: string;
    type: 'initialized' | 'progress' | 'loaded' | 'predicted' | 'unloaded' | 'error';
    payload?: any;
    error?: RuntimeError;
    progress?: ModelProgress;
}

declare global {
    interface Window {
        loadPyodide: any;
    }
}
declare class PythonEngine {
    private pyodide;
    private isInitialized;
    private worker;
    private options;
    private status;
    private pendingRequests;
    private initializationPromise;
    private onStatusChange?;
    constructor(options: PythonEngineOptions);
    private setStatus;
    getStatus(): RuntimeStatus;
    initialize(): Promise<void>;
    private performInitialization;
    private initializeWeb;
    private handleWorkerMessage;
    private handleUnsolicitedMessage;
    private generateRequestId;
    private initializeNative;
    loadModel(bundle: ModelBundle): Promise<PythonModel>;
    private loadModelWeb;
    private loadModelNative;
    private executePython;
    cleanup(): Promise<void>;
}

declare function fetchBundle(url: string): Promise<ArrayBuffer>;
declare function extractBundle(bundleBytes: ArrayBuffer): Promise<ModelBundle>;
declare function loadPythonFile(filePath: string): Promise<{
    code: string;
    manifest?: PythonModelManifest;
}>;

declare class PythonReactML {
    private engine;
    constructor(options?: PythonEngineOptions);
    loadModelFromBundle(url: string): Promise<PythonModel>;
    loadModelFromFile(filePath: string): Promise<PythonModel>;
    cleanup(): Promise<void>;
}
declare function createPythonML(options?: PythonEngineOptions): PythonReactML;

export { ModelBundle, ModelError, ModelLoadOptions, ModelProgress, ModelStatus, PythonEngine, PythonEngineOptions, PythonModel, PythonModelManifest, PythonReactML, RuntimeError, RuntimeStatus, UseModelResult, WorkerMessage, WorkerResponse, createPythonML, extractBundle, fetchBundle, loadPythonFile };
