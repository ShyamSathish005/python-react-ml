import { IInferenceEngine, InferenceJob, InferenceResult } from '@python-react-ml/inference-spec';

type RuntimeType = 'pyodide' | 'onnx' | 'tfjs';
interface ModelIOSchema {
    name: string;
    type: 'tensor' | 'array' | 'object' | 'string' | 'number' | 'boolean';
    shape?: number[];
    dtype?: 'float32' | 'int32' | 'uint8' | 'bool' | 'string';
    description?: string;
    required?: boolean;
}
interface PythonModelManifest {
    name: string;
    version: string;
    description?: string;
    author?: string;
    license?: string;
    runtime: RuntimeType;
    entrypoint?: string;
    python_version?: string;
    dependencies?: string[];
    model_file?: string;
    bundle_version: string;
    sha256: string;
    created_at: string;
    runtime_hints: {
        pyodide?: boolean;
        native?: boolean;
        memory_limit?: number;
        timeout?: number;
        gpu_acceleration?: boolean;
        quantized?: boolean;
    };
    inputs: ModelIOSchema[];
    outputs: ModelIOSchema[];
    functions?: {
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
    backend?: string;
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
    gpuAcceleration?: boolean;
    onnxOptions?: any;
    tfjsBackend?: string;
    onStatusChange?: (status: RuntimeStatus) => void;
    onProgress?: (progress: number) => void;
    onError?: (error: RuntimeError) => void;
    fallbackUrl?: string;
}
type RuntimeStatus = 'idle' | 'initializing' | 'ready' | 'loading' | 'executing' | 'error' | 'terminated';
interface RuntimeError {
    type: 'initialization' | 'loading' | 'execution' | 'network' | 'timeout' | 'memory' | 'validation';
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
interface IAdapter {
    readonly runtime: RuntimeType;
    readonly status: RuntimeStatus;
    initialize(options?: AdapterOptions): Promise<void>;
    load(bundle: ModelBundle): Promise<PythonModel>;
    predict(model: PythonModel, inputs: any): Promise<any>;
    unload(model: PythonModel): Promise<void>;
    cleanup(): Promise<void>;
    getStatus(): RuntimeStatus;
    getLastError(): RuntimeError | null;
    onStatusChange?(status: RuntimeStatus): void;
    onProgress?(progress: ModelProgress): void;
    onError?(error: RuntimeError): void;
}
interface AdapterOptions {
    enableLogging?: boolean;
    memoryLimit?: number;
    timeout?: number;
    gpuAcceleration?: boolean;
    pyodideUrl?: string;
    onnxOptions?: any;
    tfjsBackend?: string;
}
interface AdapterFactory {
    createAdapter(runtime: RuntimeType, options?: AdapterOptions): IAdapter;
    getSupportedRuntimes(): RuntimeType[];
    isRuntimeSupported(runtime: RuntimeType): boolean;
}

declare global {
    interface Window {
        loadPyodide: any;
    }
}
declare class PythonEngine implements IInferenceEngine {
    private adapter;
    private adapterFactory;
    private isInitialized;
    private options;
    private status;
    private initializationPromise;
    private onStatusChange?;
    private pyodide;
    private pool;
    private pendingRequests;
    private loadedModels;
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
    init(): Promise<void>;
    run(job: InferenceJob): Promise<InferenceResult>;
    terminate(): Promise<void>;
    loadModel(bundle: ModelBundle, runtimeOverride?: RuntimeType): Promise<PythonModel>;
    cleanup(): Promise<void>;
    private detectRuntime;
    private createAdapterOptions;
    private shouldUseFallback;
    private executeFallback;
}

declare function fetchBundle(url: string): Promise<ArrayBuffer>;
declare function extractBundle(bundleBytes: ArrayBuffer): Promise<ModelBundle>;
declare function loadPythonFile(filePath: string): Promise<{
    code: string;
    manifest?: PythonModelManifest;
}>;

/**
 * Factory for creating runtime adapters
 */
declare class RuntimeAdapterFactory implements AdapterFactory {
    private static instance;
    static getInstance(): RuntimeAdapterFactory;
    createAdapter(runtime: RuntimeType, options?: AdapterOptions): IAdapter;
    getSupportedRuntimes(): RuntimeType[];
    isRuntimeSupported(runtime: RuntimeType): boolean;
    /**
     * Detect the best runtime for the current environment
     */
    detectBestRuntime(): RuntimeType;
    /**
     * Get runtime capabilities
     */
    getRuntimeCapabilities(runtime: RuntimeType): {
        gpuAcceleration: boolean;
        webAssembly: boolean;
        pythonSupport: boolean;
        modelFormats: string[];
    };
}

/**
 * Base adapter class providing common functionality for all runtime adapters
 */
declare abstract class BaseAdapter implements IAdapter {
    readonly runtime: RuntimeType;
    protected _status: RuntimeStatus;
    protected _lastError: RuntimeError | null;
    protected _options: AdapterOptions;
    constructor(runtime: RuntimeType, options?: AdapterOptions);
    get status(): RuntimeStatus;
    protected setStatus(status: RuntimeStatus): void;
    protected setError(error: RuntimeError): void;
    protected createError(type: RuntimeError['type'], message: string, details?: any): RuntimeError;
    protected log(message: string, ...args: any[]): void;
    protected reportProgress(progress: ModelProgress): void;
    abstract initialize(options?: AdapterOptions): Promise<void>;
    abstract load(bundle: ModelBundle): Promise<PythonModel>;
    abstract predict(model: PythonModel, inputs: any): Promise<any>;
    abstract unload(model: PythonModel): Promise<void>;
    abstract cleanup(): Promise<void>;
    getStatus(): RuntimeStatus;
    getLastError(): RuntimeError | null;
    onStatusChange?(status: RuntimeStatus): void;
    onProgress?(progress: ModelProgress): void;
    onError?(error: RuntimeError): void;
    /**
     * Validate model bundle for this adapter
     */
    protected validateBundle(bundle: ModelBundle): void;
    /**
     * Runtime-specific bundle validation (to be overridden)
     */
    protected validateRuntimeSpecificBundle(bundle: ModelBundle): void;
    /**
     * Validate model inputs against schema
     */
    protected validateInputs(inputs: any, manifest: any): void;
    /**
     * Transform outputs according to schema
     */
    protected transformOutputs(outputs: any, manifest: any): any;
}

/**
 * Pyodide adapter for running Python models in the browser
 */
declare class PyodideAdapter extends BaseAdapter {
    private pool;
    private workerId;
    private loadedModels;
    constructor(options?: AdapterOptions);
    initialize(options?: AdapterOptions): Promise<void>;
    private initializeWebWorker;
    private initializeDirect;
    load(bundle: ModelBundle): Promise<PythonModel>;
    private loadModelInWorker;
    predict(model: PythonModel, inputs: any): Promise<any>;
    private predictInWorker;
    unload(model: PythonModel): Promise<void>;
    cleanup(): Promise<void>;
    protected validateRuntimeSpecificBundle(bundle: ModelBundle): void;
    private generateRequestId;
    private getWorkerScript;
}

interface InferenceSession {
    run(feeds: Record<string, Tensor$1>): Promise<Record<string, Tensor$1>>;
    release(): void;
}
interface Tensor$1 {
    data: Float32Array | Int32Array | BigInt64Array | Uint8Array;
    dims: number[];
    type: string;
}
interface ONNXRuntime {
    InferenceSession: {
        create(model: string | Uint8Array, options?: any): Promise<InferenceSession>;
    };
    Tensor: {
        new (type: string, data: any, dims: number[]): Tensor$1;
    };
    env: {
        wasm: {
            wasmPaths?: string;
            numThreads?: number;
        };
        webgl: {
            contextId?: string;
            packSize?: number;
        };
    };
}
declare global {
    const ort: ONNXRuntime;
}
/**
 * ONNX Runtime Web adapter for running ONNX models in the browser
 */
declare class ONNXAdapter extends BaseAdapter {
    private session;
    private model;
    private inputNames;
    private outputNames;
    constructor(options?: AdapterOptions);
    initialize(options?: AdapterOptions): Promise<void>;
    load(bundle: ModelBundle): Promise<PythonModel>;
    predict(inputs: any): Promise<any>;
    unload(): Promise<void>;
    cleanup(): Promise<void>;
    protected validateRuntimeSpecificBundle(bundle: ModelBundle): void;
    private extractModelFile;
    private extractModelMetadata;
    private convertInputsToTensors;
    private createTensor;
    private convertTensorsToOutputs;
    private tensorToArray;
    private flattenArray;
    private getArrayDimensions;
    private reshapeArray;
    private getExecutionProviders;
    private isWebGPUAvailable;
    private isWebGLAvailable;
}

interface TensorFlow {
    Tensor: any;
    loadLayersModel: (path: string | ArrayBuffer, options?: any) => Promise<LayersModel>;
    loadGraphModel: (path: string | ArrayBuffer, options?: any) => Promise<GraphModel>;
    tensor: (values: any, shape?: number[], dtype?: string) => Tensor;
    setBackend: (backendName: string) => Promise<boolean>;
    getBackend: () => string;
    ready: () => Promise<void>;
    browser?: {
        fromPixels: (pixels: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, numChannels?: number) => Tensor;
    };
}
interface Tensor {
    shape: number[];
    dtype: string;
    dataSync(): Float32Array | Int32Array | Uint8Array;
    arraySync(): any;
    dispose(): void;
}
interface LayersModel {
    predict(x: Tensor | Tensor[], config?: any): Tensor | Tensor[];
    dispose(): void;
    summary(): void;
    getWeights(): Tensor[];
}
interface GraphModel {
    predict(inputs: Tensor | Tensor[] | {
        [name: string]: Tensor;
    }, config?: any): Tensor | Tensor[] | {
        [name: string]: Tensor;
    };
    execute(inputs: Tensor | Tensor[] | {
        [name: string]: Tensor;
    }, outputs?: string | string[]): Tensor | Tensor[];
    dispose(): void;
    getWeights(): Tensor[];
}
declare global {
    const tf: TensorFlow;
}
/**
 * TensorFlow.js adapter for running TensorFlow models in the browser
 */
declare class TFJSAdapter extends BaseAdapter {
    private model;
    private modelType;
    private loadedModel;
    private inputTensors;
    constructor(options?: AdapterOptions);
    initialize(options?: AdapterOptions): Promise<void>;
    load(bundle: ModelBundle): Promise<PythonModel>;
    predict(inputs: any): Promise<any>;
    unload(): Promise<void>;
    cleanup(): Promise<void>;
    protected validateRuntimeSpecificBundle(bundle: ModelBundle): void;
    private extractModelData;
    private detectModelFormat;
    private convertInputsToTensors;
    private createTensor;
    private convertTensorsToOutputs;
    private inferShape;
    private mapDataType;
    private disposeInputTensors;
}

declare class PythonReactML {
    private engine;
    constructor(options?: PythonEngineOptions);
    loadModelFromBundle(url: string, runtime?: RuntimeType): Promise<PythonModel>;
    loadModelFromFile(filePath: string, runtime?: RuntimeType): Promise<PythonModel>;
    cleanup(): Promise<void>;
}
declare function createPythonML(options?: PythonEngineOptions): PythonReactML;

export { AdapterFactory, AdapterOptions, BaseAdapter, IAdapter, ModelBundle, ModelError, ModelIOSchema, ModelLoadOptions, ModelProgress, ModelStatus, ONNXAdapter, PyodideAdapter, PythonEngine, PythonEngineOptions, PythonModel, PythonModelManifest, PythonReactML, RuntimeAdapterFactory, RuntimeError, RuntimeStatus, RuntimeType, TFJSAdapter, UseModelResult, WorkerMessage, WorkerResponse, createPythonML, extractBundle, fetchBundle, loadPythonFile };
