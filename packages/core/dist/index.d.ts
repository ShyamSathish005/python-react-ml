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
declare class PythonEngine {
    private adapter;
    private adapterFactory;
    private isInitialized;
    private options;
    private status;
    private initializationPromise;
    private onStatusChange?;
    private pyodide;
    private worker;
    private pendingRequests;
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
    loadModel(bundle: ModelBundle, runtimeOverride?: RuntimeType): Promise<PythonModel>;
    private loadModelWeb;
    private loadModelNative;
    private executePython;
    cleanup(): Promise<void>;
    private detectRuntime;
    private createAdapterOptions;
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
    private pyodide;
    private worker;
    private loadedModels;
    private pendingRequests;
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
    private handleWorkerMessage;
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

/**
 * Phase 2.5: Advanced Types for Groundbreaking Features
 *
 * This file extends the core types with advanced features:
 * - WebGPU runtime support
 * - Auto-optimization
 * - Model registry and marketplace
 * - Pipeline system
 * - Privacy features
 * - Monitoring and explainability
 * - Training support
 */

type ExtendedRuntimeType = RuntimeType | 'webgpu' | 'wasm' | 'native-ios' | 'native-android';
interface WebGPUCapabilities {
    supported: boolean;
    adapter?: any;
    device?: any;
    features: string[];
    limits: Record<string, number>;
    maxComputeWorkgroupSize: [number, number, number];
}
interface DeviceCapabilities {
    platform: 'web' | 'ios' | 'android' | 'desktop';
    gpu: {
        available: boolean;
        type?: 'integrated' | 'discrete' | 'apple-neural-engine' | 'qualcomm-npu';
        memory?: number;
        webgpu?: WebGPUCapabilities;
    };
    cpu: {
        cores: number;
        architecture: 'x86' | 'arm' | 'unknown';
    };
    memory: {
        total: number;
        available: number;
    };
    network: {
        type: 'wifi' | '4g' | '5g' | 'ethernet' | 'offline';
        speed?: number;
    };
    battery?: {
        level: number;
        charging: boolean;
    };
}
type QuantizationType = 'none' | 'dynamic' | 'int8' | 'fp16' | 'mixed-precision';
type CompressionLevel = 'none' | 'light' | 'moderate' | 'aggressive';
interface OptimizationOptions {
    autoOptimize?: boolean;
    targetDevice?: 'auto' | DeviceCapabilities;
    quantization?: QuantizationType;
    compressionLevel?: CompressionLevel;
    memoryBudget?: number;
    latencyTarget?: number;
    powerMode?: 'performance' | 'balanced' | 'power-saver';
    pruning?: {
        enabled: boolean;
        threshold: number;
    };
}
interface OptimizationResult {
    originalSize: number;
    optimizedSize: number;
    compressionRatio: number;
    estimatedLatency: number;
    recommendedRuntime: ExtendedRuntimeType;
    quantizationApplied: QuantizationType;
    transformations: string[];
}
interface ModelMetadata {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    license: string;
    tags: string[];
    category: 'computer-vision' | 'nlp' | 'audio' | 'multimodal' | 'other';
    runtime: ExtendedRuntimeType;
    size: number;
    downloads: number;
    rating: number;
    created: string;
    updated: string;
    homepage?: string;
    repository?: string;
    documentation?: string;
}
interface ModelVersion {
    version: string;
    changelog: string;
    compatibility: string[];
    deprecated: boolean;
    downloadUrl: string;
    sha256: string;
    size: number;
    releaseDate: string;
}
interface RegistryOptions {
    registry?: string;
    cache?: boolean;
    autoUpdate?: boolean;
    version?: string | 'latest';
    fallback?: 'previous-version' | 'error';
}
interface ABTestConfig {
    enabled: boolean;
    variants: {
        name: string;
        modelId: string;
        weight: number;
    }[];
    metrics: string[];
}
interface PipelineStage {
    name: string;
    model: string | PythonModel;
    runtime?: ExtendedRuntimeType;
    transform?: (input: any) => any;
    cache?: boolean;
    parallel?: boolean;
}
interface PipelineOptions {
    streaming?: boolean;
    caching?: 'none' | 'aggressive' | 'smart';
    parallelism?: 'sequential' | 'parallel' | 'auto';
    errorHandling?: 'fail-fast' | 'continue' | 'retry';
    retryAttempts?: number;
    timeout?: number;
}
interface PipelineResult<T = any> {
    outputs: T[];
    metadata: {
        stages: string[];
        timings: Record<string, number>;
        cacheHits: number;
        errors: any[];
    };
}
interface StreamingPipelineResult<T = any> {
    stream: AsyncIterableIterator<T>;
    metadata: {
        stages: string[];
        currentStage: string;
    };
}
interface PrivacyOptions {
    differentialPrivacy?: {
        enabled: boolean;
        epsilon: number;
        delta?: number;
        mechanism?: 'laplace' | 'gaussian';
    };
    localProcessingOnly?: boolean;
    encryptedInference?: boolean;
    noTelemetry?: boolean;
    clearMemoryAfter?: boolean;
    secureMPC?: {
        enabled: boolean;
        parties: number;
    };
}
interface PrivacyGuarantee {
    dataLeavesDevice: boolean;
    differentialPrivacyApplied: boolean;
    epsilon?: number;
    encryptionUsed: boolean;
    telemetryEnabled: boolean;
}
type ExplainabilityMethod = 'grad-cam' | 'lime' | 'shap' | 'attention' | 'integrated-gradients';
interface MonitoringOptions {
    explainability?: ExplainabilityMethod;
    profiling?: boolean;
    driftDetection?: boolean;
    adversarialTesting?: 'none' | 'test' | 'defend';
    logging?: {
        level: 'none' | 'error' | 'warn' | 'info' | 'debug';
        destination: 'console' | 'remote' | 'both';
    };
}
interface InferenceMetrics {
    latency: number;
    throughput?: number;
    memoryUsed: number;
    gpuUtilization?: number;
    cacheHitRate?: number;
    errorRate?: number;
}
interface LayerProfile {
    name: string;
    type: string;
    inputShape: number[];
    outputShape: number[];
    parameters: number;
    computeTime: number;
    memoryUsed: number;
}
interface ModelExplanation {
    method: ExplainabilityMethod;
    prediction: any;
    confidence: number;
    explanation: {
        featureImportance?: Record<string, number>;
        heatmap?: ImageData | number[][];
        attentionWeights?: number[][];
        topInfluences?: {
            feature: string;
            impact: number;
        }[];
    };
}
interface DriftReport {
    detected: boolean;
    severity: 'none' | 'low' | 'medium' | 'high';
    type: 'data-drift' | 'concept-drift' | 'both';
    metrics: {
        ks_statistic?: number;
        psi?: number;
        drift_score: number;
    };
    recommendations: string[];
}
interface TrainingOptions {
    architecture?: 'custom' | string;
    optimizer: 'sgd' | 'adam' | 'adamw' | 'rmsprop';
    lossFunction: string;
    learningRate: number;
    batchSize: number;
    epochs: number;
    validationSplit?: number;
    callbacks?: TrainingCallback[];
    federatedLearning?: {
        enabled: boolean;
        aggregationStrategy: 'fedavg' | 'fedprox';
        minClients: number;
    };
}
interface TrainingCallback {
    name: string;
    onEpochEnd?: (epoch: number, logs: TrainingLogs) => void | Promise<void>;
    onBatchEnd?: (batch: number, logs: TrainingLogs) => void | Promise<void>;
    onTrainEnd?: (logs: TrainingLogs) => void | Promise<void>;
}
interface TrainingLogs {
    epoch?: number;
    batch?: number;
    loss: number;
    accuracy?: number;
    valLoss?: number;
    valAccuracy?: number;
    learningRate: number;
    [key: string]: any;
}
interface TrainingResult {
    finalLoss: number;
    finalAccuracy: number;
    history: TrainingLogs[];
    model: PythonModel;
    totalTime: number;
}
interface RealtimeOptions {
    latencyBudget: number;
    framePriority?: 'quality' | 'speed';
    frameSkipping?: 'none' | 'adaptive' | 'aggressive';
    asyncInference?: boolean;
    predictionQueue?: {
        enabled: boolean;
        maxSize: number;
        strategy: 'fifo' | 'lifo' | 'priority';
    };
}
interface FrameResult {
    prediction: any;
    latency: number;
    frameSkipped: boolean;
    queueSize: number;
}
interface TypeGenOptions {
    outputPath: string;
    modelSchema: ModelIOSchema[];
    namespace?: string;
    exportFormat?: 'esm' | 'cjs' | 'types-only';
}
interface HotReloadOptions {
    enabled: boolean;
    watchPaths: string[];
    debounceMs?: number;
    onReload?: (modelPath: string) => void;
}
interface PlaygroundOptions {
    port?: number;
    modelPath: string;
    autoOpen?: boolean;
    features?: {
        profiling: boolean;
        explainability: boolean;
        testing: boolean;
    };
}
interface ExtendedEngineOptions {
    runtime?: ExtendedRuntimeType;
    platform?: 'web' | 'native';
    optimization?: OptimizationOptions;
    registry?: RegistryOptions;
    privacy?: PrivacyOptions;
    monitoring?: MonitoringOptions;
    realtime?: RealtimeOptions;
    training?: Partial<TrainingOptions>;
    hotReload?: HotReloadOptions;
    experimental?: {
        quantumML?: boolean;
        neuralArchitectureSearch?: boolean;
        continuousLearning?: boolean;
        metaLearning?: 'maml' | 'reptile' | 'none';
    };
}
interface ExtendedModelResult {
    model: PythonModel | null;
    status: RuntimeStatus;
    error: RuntimeError | null;
    predict: (input: any, options?: PredictOptions) => Promise<any>;
    unload: () => Promise<void>;
    reload: () => Promise<void>;
    explain?: (input: any, method?: ExplainabilityMethod) => Promise<ModelExplanation>;
    profile?: () => Promise<LayerProfile[]>;
    optimize?: (options: OptimizationOptions) => Promise<OptimizationResult>;
    train?: (data: any, options: TrainingOptions) => Promise<TrainingResult>;
    metrics?: InferenceMetrics;
    privacyGuarantee?: PrivacyGuarantee;
    isReady: boolean;
    isOptimized: boolean;
    version?: string;
}
interface PredictOptions {
    explain?: boolean;
    profile?: boolean;
    timeout?: number;
    priority?: 'low' | 'normal' | 'high';
}
interface WebGPUAdapterOptions {
    shaders?: {
        custom?: Map<string, string>;
    };
    workgroupSize?: [number, number, number];
    memoryPooling?: boolean;
    mixedPrecision?: boolean;
}
interface ComputeShaderInfo {
    name: string;
    code: string;
    workgroupSize: [number, number, number];
    bindings: {
        group: number;
        binding: number;
        type: 'buffer' | 'texture' | 'sampler';
    }[];
}

/**
 * WebGPU Adapter - High-performance GPU compute
 *
 * This adapter leverages WebGPU for maximum performance:
 * - Direct GPU compute shaders (WGSL)
 * - Zero-copy data transfers
 * - Advanced memory management
 * - Mixed precision support
 */

declare global {
    interface Navigator {
        gpu?: any;
    }
}
declare class WebGPUAdapter extends BaseAdapter {
    private gpu;
    private adapter;
    private device;
    private capabilities;
    private computePipelines;
    private bufferPool;
    private customShaders;
    constructor();
    initialize(options?: AdapterOptions & WebGPUAdapterOptions): Promise<void>;
    load(bundle: ModelBundle): Promise<PythonModel>;
    predict(model: any, inputs: any): Promise<any>;
    unload(model: PythonModel): Promise<void>;
    cleanup(): Promise<void>;
    private getCapabilities;
    registerShader(name: string, code: string, workgroupSize: [number, number, number]): void;
    private parseModelBundle;
    private createComputePipelines;
    private getShaderForLayer;
    private allocateBuffers;
    private createInputBuffers;
    private createOutputBuffers;
    private executeComputePass;
    private createBindGroup;
    private calculateWorkgroupCount;
    private readOutputBuffers;
    private normalizeInput;
    private calculateBufferSize;
    private formatOutput;
    private reshapeOutput;
    private unloadModel;
    getCapabilitiesSync(): WebGPUCapabilities | null;
}

/**
 * Auto-Optimization Engine
 *
 * Intelligently optimizes models based on device capabilities:
 * - Device detection and profiling
 * - Runtime selection
 * - Quantization
 * - Compression
 * - Performance estimation
 */

declare class AutoOptimizer {
    private deviceCapabilities;
    constructor();
    /**
     * Detect current device capabilities
     */
    private detectDevice;
    /**
     * Get comprehensive device capabilities
     */
    getDeviceCapabilities(): Promise<DeviceCapabilities>;
    /**
     * Optimize a model based on device capabilities and options
     */
    optimize(bundle: ModelBundle, options?: OptimizationOptions): Promise<OptimizationResult>;
    /**
     * Select optimal runtime based on model and device
     */
    private selectOptimalRuntime;
    /**
     * Select optimal quantization strategy
     */
    private selectQuantization;
    /**
     * Select compression level
     */
    private selectCompression;
    /**
     * Estimate inference latency
     */
    private estimateLatency;
    /**
     * Calculate bundle size
     */
    private calculateBundleSize;
    /**
     * Calculate optimized size after compression and quantization
     */
    private calculateOptimizedSize;
    private detectPlatform;
    private detectGPU;
    private detectGPUType;
    private detectCPU;
    private detectMemory;
    private detectNetwork;
    private detectBattery;
    /**
     * Get a human-readable capabilities report
     */
    getCapabilitiesReport(): Promise<string>;
}
declare const autoOptimizer: AutoOptimizer;

/**
 * Model Registry System
 *
 * NPM-like registry for ML models:
 * - Model discovery and search
 * - Version management
 * - Hot-swapping
 * - A/B testing
 * - Usage analytics
 */

interface RegistrySearchResult {
    models: ModelMetadata[];
    total: number;
    page: number;
    pageSize: number;
}
declare class ModelRegistry {
    private registryUrl;
    private cache;
    private metadata;
    private abTests;
    constructor(registryUrl?: string);
    /**
     * Search for models in the registry
     */
    search(query: string, options?: {
        category?: ModelMetadata['category'];
        tags?: string[];
        limit?: number;
        offset?: number;
    }): Promise<RegistrySearchResult>;
    /**
     * Get model metadata by ID
     */
    getMetadata(modelId: string): Promise<ModelMetadata>;
    /**
     * Get available versions for a model
     */
    getVersions(modelId: string): Promise<ModelVersion[]>;
    /**
     * Download and load a model from the registry
     */
    load(modelId: string, options?: RegistryOptions): Promise<ModelBundle>;
    /**
     * Load model with marketplace:// protocol
     */
    loadFromMarketplace(uri: string, options?: RegistryOptions): Promise<ModelBundle>;
    /**
     * Publish a model to the registry
     */
    publish(model: ModelBundle, metadata: Partial<ModelMetadata>, apiKey: string): Promise<ModelMetadata>;
    /**
     * Configure A/B testing for a model
     */
    configureABTest(modelId: string, config: ABTestConfig): void;
    /**
     * Get model variant based on A/B test configuration
     */
    getABTestVariant(modelId: string): string;
    /**
     * Clear cache
     */
    clearCache(modelId?: string): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        size: number;
        models: string[];
        totalBytes: number;
    };
    private downloadBundle;
    private validateBundle;
    private trackDownload;
    private loadFallback;
    private getMockSearchResults;
}
declare const modelRegistry: ModelRegistry;

/**
 * Pipeline System
 *
 * Chain multiple models together:
 * - Sequential and parallel execution
 * - Streaming support
 * - Smart caching
 * - Error handling
 * - Multi-modal workflows
 */

declare class ModelPipeline {
    private stages;
    private cache;
    private options;
    private factory;
    constructor(stages: PipelineStage[], options?: PipelineOptions);
    /**
     * Initialize the pipeline by loading all models
     */
    initialize(stageConfigs: PipelineStage[]): Promise<void>;
    /**
     * Process input through the entire pipeline
     */
    process<T = any>(input: any): Promise<PipelineResult<T>>;
    /**
     * Process input as a stream
     */
    processStream<T = any>(input: any): AsyncIterableIterator<{
        stage: string;
        output: T;
        timing: number;
    }>;
    /**
     * Get streaming pipeline result
     */
    getStreamingResult<T = any>(input: any): Promise<StreamingPipelineResult<T>>;
    /**
     * Process batch of inputs
     */
    processBatch<T = any>(inputs: any[]): Promise<PipelineResult<T>[]>;
    /**
     * Clear pipeline cache
     */
    clearCache(stage?: string): void;
    /**
     * Get pipeline statistics
     */
    getStats(): {
        stages: number;
        cacheSize: number;
        cacheKeys: number;
    };
    /**
     * Unload all models and cleanup
     */
    cleanup(): Promise<void>;
    private loadModel;
    private runStageWithRetry;
    private getCacheKey;
    private simpleHash;
    private setCacheEntry;
    private getMaxCacheSize;
    private getCacheSize;
}
/**
 * Helper function to create a pipeline
 */
declare function createPipeline(stages: PipelineStage[], options?: PipelineOptions): ModelPipeline;

/**
 * Privacy Module
 *
 * Privacy-first AI features:
 * - Differential privacy
 * - Local-only processing
 * - Encrypted inference
 * - Privacy guarantees
 * - No telemetry mode
 */

declare class PrivacyManager {
    private options;
    constructor(options?: PrivacyOptions);
    /**
     * Apply differential privacy noise to output
     */
    applyDifferentialPrivacy<T = any>(output: T): T;
    /**
     * Encrypt data for secure inference
     */
    encryptData(data: any): Promise<string>;
    /**
     * Decrypt encrypted inference result
     */
    decryptData(encryptedData: string): Promise<any>;
    /**
     * Clear sensitive data from memory
     */
    clearMemory(data: any): void;
    /**
     * Get privacy guarantee for current configuration
     */
    getPrivacyGuarantee(): PrivacyGuarantee;
    /**
     * Validate that privacy requirements are met
     */
    validatePrivacyRequirements(): {
        valid: boolean;
        issues: string[];
    };
    /**
     * Generate a privacy report
     */
    generatePrivacyReport(): string;
    private laplaceNoise;
    private gaussianNoise;
    private generateEncryptionKey;
    private isEncryptionAvailable;
    /**
     * Update privacy options
     */
    updateOptions(options: Partial<PrivacyOptions>): void;
    /**
     * Get current privacy options
     */
    getOptions(): PrivacyOptions;
}
declare const privacyManager: PrivacyManager;

/**
 * Monitoring & Explainability Module
 *
 * Model monitoring and interpretation:
 * - Performance profiling
 * - Explainability (SHAP, LIME, Grad-CAM)
 * - Drift detection
 * - Metrics tracking
 */

declare class ModelMonitor {
    private options;
    private metricsHistory;
    private predictionHistory;
    private baselineDistribution;
    constructor(options?: MonitoringOptions);
    /**
     * Profile a model's layer-by-layer performance
     */
    profileModel(model: PythonModel, input: any): Promise<LayerProfile[]>;
    /**
     * Explain a model's prediction
     */
    explainPrediction(model: PythonModel, input: any, prediction: any, method?: ExplainabilityMethod): Promise<ModelExplanation>;
    /**
     * Track inference metrics
     */
    trackInference(metrics: Partial<InferenceMetrics>): void;
    /**
     * Track prediction for drift detection
     */
    trackPrediction(input: any, output: any): void;
    /**
     * Detect data or concept drift
     */
    detectDrift(): Promise<DriftReport>;
    /**
     * Get aggregated metrics
     */
    getAggregatedMetrics(): {
        avgLatency: number;
        p95Latency: number;
        p99Latency: number;
        avgMemory: number;
        avgGpuUtilization: number;
        totalInferences: number;
    };
    /**
     * Clear monitoring history
     */
    clearHistory(): void;
    private generateGradCAM;
    private generateLIME;
    private generateSHAP;
    private generateAttention;
    private generateIntegratedGradients;
    private generateMockHeatmap;
    private kolmogorovSmirnovTest;
    private populationStabilityIndex;
    private extractNumericFeatures;
    private average;
    private percentile;
    private log;
    private shouldLog;
}
declare const modelMonitor: ModelMonitor;

declare class PythonReactML {
    private engine;
    constructor(options?: PythonEngineOptions);
    loadModelFromBundle(url: string, runtime?: RuntimeType): Promise<PythonModel>;
    loadModelFromFile(filePath: string, runtime?: RuntimeType): Promise<PythonModel>;
    cleanup(): Promise<void>;
}
declare function createPythonML(options?: PythonEngineOptions): PythonReactML;

export { ABTestConfig, AdapterFactory, AdapterOptions, AutoOptimizer, BaseAdapter, CompressionLevel, ComputeShaderInfo, DeviceCapabilities, DriftReport, ExplainabilityMethod, ExtendedEngineOptions, ExtendedModelResult, ExtendedRuntimeType, FrameResult, HotReloadOptions, IAdapter, InferenceMetrics, LayerProfile, ModelBundle, ModelError, ModelExplanation, ModelIOSchema, ModelLoadOptions, ModelMetadata, ModelMonitor, ModelPipeline, ModelProgress, ModelRegistry, ModelStatus, ModelVersion, MonitoringOptions, ONNXAdapter, OptimizationOptions, OptimizationResult, PipelineOptions, PipelineResult, PipelineStage, PlaygroundOptions, PredictOptions, PrivacyGuarantee, PrivacyManager, PrivacyOptions, PyodideAdapter, PythonEngine, PythonEngineOptions, PythonModel, PythonModelManifest, PythonReactML, QuantizationType, RealtimeOptions, RegistryOptions, RuntimeAdapterFactory, RuntimeError, RuntimeStatus, RuntimeType, StreamingPipelineResult, TFJSAdapter, TrainingCallback, TrainingLogs, TrainingOptions, TrainingResult, TypeGenOptions, UseModelResult, WebGPUAdapter, WebGPUAdapterOptions, WebGPUCapabilities, WorkerMessage, WorkerResponse, autoOptimizer, createPipeline, createPythonML, extractBundle, fetchBundle, loadPythonFile, modelMonitor, modelRegistry, privacyManager };
