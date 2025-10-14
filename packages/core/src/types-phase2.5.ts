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

import { RuntimeType, ModelIOSchema, PythonModel, RuntimeStatus, RuntimeError, ModelBundle } from './types';

// ============================================================================
// Extended Runtime Types
// ============================================================================

export type ExtendedRuntimeType = RuntimeType | 'webgpu' | 'wasm' | 'native-ios' | 'native-android';

export interface WebGPUCapabilities {
  supported: boolean;
  adapter?: any; // GPUAdapter
  device?: any; // GPUDevice
  features: string[];
  limits: Record<string, number>;
  maxComputeWorkgroupSize: [number, number, number];
}

// ============================================================================
// Auto-Optimization
// ============================================================================

export interface DeviceCapabilities {
  platform: 'web' | 'ios' | 'android' | 'desktop';
  gpu: {
    available: boolean;
    type?: 'integrated' | 'discrete' | 'apple-neural-engine' | 'qualcomm-npu';
    memory?: number; // MB
    webgpu?: WebGPUCapabilities;
  };
  cpu: {
    cores: number;
    architecture: 'x86' | 'arm' | 'unknown';
  };
  memory: {
    total: number; // MB
    available: number; // MB
  };
  network: {
    type: 'wifi' | '4g' | '5g' | 'ethernet' | 'offline';
    speed?: number; // Mbps
  };
  battery?: {
    level: number; // 0-100
    charging: boolean;
  };
}

export type QuantizationType = 'none' | 'dynamic' | 'int8' | 'fp16' | 'mixed-precision';

export type CompressionLevel = 'none' | 'light' | 'moderate' | 'aggressive';

export interface OptimizationOptions {
  autoOptimize?: boolean;
  targetDevice?: 'auto' | DeviceCapabilities;
  quantization?: QuantizationType;
  compressionLevel?: CompressionLevel;
  memoryBudget?: number; // MB
  latencyTarget?: number; // ms
  powerMode?: 'performance' | 'balanced' | 'power-saver';
  pruning?: {
    enabled: boolean;
    threshold: number;
  };
}

export interface OptimizationResult {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  estimatedLatency: number;
  recommendedRuntime: ExtendedRuntimeType;
  quantizationApplied: QuantizationType;
  transformations: string[];
}

// ============================================================================
// Model Registry & Marketplace
// ============================================================================

export interface ModelMetadata {
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

export interface ModelVersion {
  version: string;
  changelog: string;
  compatibility: string[];
  deprecated: boolean;
  downloadUrl: string;
  sha256: string;
  size: number;
  releaseDate: string;
}

export interface RegistryOptions {
  registry?: string; // Custom registry URL
  cache?: boolean;
  autoUpdate?: boolean;
  version?: string | 'latest';
  fallback?: 'previous-version' | 'error';
}

export interface ABTestConfig {
  enabled: boolean;
  variants: {
    name: string;
    modelId: string;
    weight: number; // 0-100
  }[];
  metrics: string[];
}

// ============================================================================
// Pipeline System
// ============================================================================

export interface PipelineStage {
  name: string;
  model: string | PythonModel;
  runtime?: ExtendedRuntimeType;
  transform?: (input: any) => any;
  cache?: boolean;
  parallel?: boolean;
}

export interface PipelineOptions {
  streaming?: boolean;
  caching?: 'none' | 'aggressive' | 'smart';
  parallelism?: 'sequential' | 'parallel' | 'auto';
  errorHandling?: 'fail-fast' | 'continue' | 'retry';
  retryAttempts?: number;
  timeout?: number;
}

export interface PipelineResult<T = any> {
  outputs: T[];
  metadata: {
    stages: string[];
    timings: Record<string, number>;
    cacheHits: number;
    errors: any[];
  };
}

export interface StreamingPipelineResult<T = any> {
  stream: AsyncIterableIterator<T>;
  metadata: {
    stages: string[];
    currentStage: string;
  };
}

// ============================================================================
// Privacy Features
// ============================================================================

export interface PrivacyOptions {
  differentialPrivacy?: {
    enabled: boolean;
    epsilon: number; // Privacy budget
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

export interface PrivacyGuarantee {
  dataLeavesDevice: boolean;
  differentialPrivacyApplied: boolean;
  epsilon?: number;
  encryptionUsed: boolean;
  telemetryEnabled: boolean;
}

// ============================================================================
// Monitoring & Explainability
// ============================================================================

export type ExplainabilityMethod = 'grad-cam' | 'lime' | 'shap' | 'attention' | 'integrated-gradients';

export interface MonitoringOptions {
  explainability?: ExplainabilityMethod;
  profiling?: boolean;
  driftDetection?: boolean;
  adversarialTesting?: 'none' | 'test' | 'defend';
  logging?: {
    level: 'none' | 'error' | 'warn' | 'info' | 'debug';
    destination: 'console' | 'remote' | 'both';
  };
}

export interface InferenceMetrics {
  latency: number; // ms
  throughput?: number; // inferences/sec
  memoryUsed: number; // MB
  gpuUtilization?: number; // 0-100
  cacheHitRate?: number; // 0-100
  errorRate?: number; // 0-100
}

export interface LayerProfile {
  name: string;
  type: string;
  inputShape: number[];
  outputShape: number[];
  parameters: number;
  computeTime: number; // ms
  memoryUsed: number; // MB
}

export interface ModelExplanation {
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

export interface DriftReport {
  detected: boolean;
  severity: 'none' | 'low' | 'medium' | 'high';
  type: 'data-drift' | 'concept-drift' | 'both';
  metrics: {
    ks_statistic?: number;
    psi?: number; // Population Stability Index
    drift_score: number;
  };
  recommendations: string[];
}

// ============================================================================
// Training Support
// ============================================================================

export interface TrainingOptions {
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

export interface TrainingCallback {
  name: string;
  onEpochEnd?: (epoch: number, logs: TrainingLogs) => void | Promise<void>;
  onBatchEnd?: (batch: number, logs: TrainingLogs) => void | Promise<void>;
  onTrainEnd?: (logs: TrainingLogs) => void | Promise<void>;
}

export interface TrainingLogs {
  epoch?: number;
  batch?: number;
  loss: number;
  accuracy?: number;
  valLoss?: number;
  valAccuracy?: number;
  learningRate: number;
  [key: string]: any;
}

export interface TrainingResult {
  finalLoss: number;
  finalAccuracy: number;
  history: TrainingLogs[];
  model: PythonModel;
  totalTime: number;
}

// ============================================================================
// Real-time & Gaming
// ============================================================================

export interface RealtimeOptions {
  latencyBudget: number; // ms - max latency per frame
  framePriority?: 'quality' | 'speed';
  frameSkipping?: 'none' | 'adaptive' | 'aggressive';
  asyncInference?: boolean;
  predictionQueue?: {
    enabled: boolean;
    maxSize: number;
    strategy: 'fifo' | 'lifo' | 'priority';
  };
}

export interface FrameResult {
  prediction: any;
  latency: number;
  frameSkipped: boolean;
  queueSize: number;
}

// ============================================================================
// Developer Experience
// ============================================================================

export interface TypeGenOptions {
  outputPath: string;
  modelSchema: ModelIOSchema[];
  namespace?: string;
  exportFormat?: 'esm' | 'cjs' | 'types-only';
}

export interface HotReloadOptions {
  enabled: boolean;
  watchPaths: string[];
  debounceMs?: number;
  onReload?: (modelPath: string) => void;
}

export interface PlaygroundOptions {
  port?: number;
  modelPath: string;
  autoOpen?: boolean;
  features?: {
    profiling: boolean;
    explainability: boolean;
    testing: boolean;
  };
}

// ============================================================================
// Extended Engine Options
// ============================================================================

export interface ExtendedEngineOptions {
  // Phase 2 options
  runtime?: ExtendedRuntimeType;
  platform?: 'web' | 'native';
  
  // Phase 2.5 options
  optimization?: OptimizationOptions;
  registry?: RegistryOptions;
  privacy?: PrivacyOptions;
  monitoring?: MonitoringOptions;
  realtime?: RealtimeOptions;
  training?: Partial<TrainingOptions>;
  hotReload?: HotReloadOptions;
  
  // Experimental features
  experimental?: {
    quantumML?: boolean;
    neuralArchitectureSearch?: boolean;
    continuousLearning?: boolean;
    metaLearning?: 'maml' | 'reptile' | 'none';
  };
}

// ============================================================================
// Enhanced Model Result
// ============================================================================

export interface ExtendedModelResult {
  model: PythonModel | null;
  status: RuntimeStatus;
  error: RuntimeError | null;
  
  // Core methods
  predict: (input: any, options?: PredictOptions) => Promise<any>;
  unload: () => Promise<void>;
  reload: () => Promise<void>;
  
  // Phase 2.5 methods
  explain?: (input: any, method?: ExplainabilityMethod) => Promise<ModelExplanation>;
  profile?: () => Promise<LayerProfile[]>;
  optimize?: (options: OptimizationOptions) => Promise<OptimizationResult>;
  train?: (data: any, options: TrainingOptions) => Promise<TrainingResult>;
  
  // Metrics
  metrics?: InferenceMetrics;
  privacyGuarantee?: PrivacyGuarantee;
  
  // State
  isReady: boolean;
  isOptimized: boolean;
  version?: string;
}

export interface PredictOptions {
  explain?: boolean;
  profile?: boolean;
  timeout?: number;
  priority?: 'low' | 'normal' | 'high';
}

// ============================================================================
// WebGPU Adapter Specific
// ============================================================================

export interface WebGPUAdapterOptions {
  shaders?: {
    custom?: Map<string, string>; // Operation name -> WGSL code
  };
  workgroupSize?: [number, number, number];
  memoryPooling?: boolean;
  mixedPrecision?: boolean;
}

export interface ComputeShaderInfo {
  name: string;
  code: string; // WGSL
  workgroupSize: [number, number, number];
  bindings: {
    group: number;
    binding: number;
    type: 'buffer' | 'texture' | 'sampler';
  }[];
}
