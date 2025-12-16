import type {
  PythonModel,
  ModelBundle,
  PythonEngineOptions,
  WorkerMessage,
  WorkerResponse,
  RuntimeStatus,
  RuntimeError,
  RuntimeType,
  IAdapter,
  AdapterOptions
} from './types';
import { RuntimeAdapterFactory } from './adapters/factory';
import { WorkerPoolManager } from './pool/workerPool';

declare global {
  interface Window {
    loadPyodide: any;
  }
}

export class PythonEngine {
  private adapter: IAdapter | null = null;
  private adapterFactory: RuntimeAdapterFactory;
  private isInitialized = false;
  private options: PythonEngineOptions;
  private status: RuntimeStatus = 'idle';
  private initializationPromise: Promise<void> | null = null;
  private onStatusChange?: (status: RuntimeStatus) => void;

  // Legacy support - kept for backward compatibility
  private pyodide: any = null;
  private pool: WorkerPoolManager;
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(options: PythonEngineOptions) {
    this.options = options;
    this.onStatusChange = options.onStatusChange;
    this.adapterFactory = RuntimeAdapterFactory.getInstance();
    this.pool = WorkerPoolManager.getInstance();
  }

  private setStatus(status: RuntimeStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange?.(status);
    }
  }

  getStatus(): RuntimeStatus {
    return this.status;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Return existing initialization promise if already in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();

    try {
      await this.initializationPromise;
      this.isInitialized = true;
      this.setStatus('ready');
    } catch (error) {
      this.setStatus('error');
      const runtimeError: RuntimeError = {
        type: 'initialization',
        message: `Engine initialization failed: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
        details: error
      };
      this.options.onError?.(runtimeError);
      throw runtimeError;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async performInitialization(): Promise<void> {
    this.setStatus('initializing');

    if (this.options.platform === 'web') {
      await this.initializeWeb();
    } else {
      await this.initializeNative();
    }
  }

  private async initializeWeb(): Promise<void> {
    // Check Web Workers support
    if (typeof window === 'undefined' || !('Worker' in window)) {
      throw new Error('Web Workers not supported in this environment');
    }

    try {
      // Resolve worker path
      let workerPath = '/pyodide-worker.js'; // Default public path

      // Check if we're in a bundled environment
      if (typeof window !== 'undefined' && window.location) {
        // In production, worker should be in public folder
        workerPath = new URL('/pyodide-worker.js', window.location.origin).href;
      }

      // Configure pool first
      this.pool.configure(this.options, workerPath);

      // We no longer acquire a worker here directly; Adapters acquire them as needed.

    } catch (error) {
      throw new Error(`Failed to initialize worker pool: ${(error as Error).message}`);
    }
  }

  private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
    // Unused
  }

  private handleUnsolicitedMessage(response: WorkerResponse): void {
    // Unused
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private async initializeNative(): Promise<void> {
    // This will be implemented with native bridge
    throw new Error('Native platform not yet implemented');
  }

  async loadModel(bundle: ModelBundle, runtimeOverride?: RuntimeType): Promise<PythonModel> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Determine runtime to use
    const runtime = runtimeOverride || bundle.manifest.runtime || this.detectRuntime(bundle);

    // Create and initialize adapter if not already done or runtime changed
    if (!this.adapter || this.adapter.runtime !== runtime) {
      if (this.adapter) {
        await this.adapter.cleanup();
      }

      const adapterOptions = this.createAdapterOptions();
      this.adapter = this.adapterFactory.createAdapter(runtime, adapterOptions);
      await this.adapter.initialize(adapterOptions);
    }

    // Load model using adapter
    this.setStatus('loading');
    try {
      const model = await this.adapter.load(bundle);
      this.setStatus('ready');

      // Hybrid Resolver Logic
      if (this.options.fallbackUrl) {
        const originalPredict = model.predict.bind(model);
        model.predict = async (input: any) => {
          if (await this.shouldUseFallback()) {
            return this.executeFallback(input);
          }
          return originalPredict(input);
        };
      }

      return model;
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }

  // Legacy methods removed (loadModelWeb, executePython)


  async cleanup(): Promise<void> {
    this.setStatus('terminated');

    // Clear all pending requests
    for (const [requestId, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Engine terminated'));
    }
    this.pendingRequests.clear();

    // No direct worker to terminate since we migrated to pool.
    // Adapters manage their own pool resources or cleanup calls pool.terminate if needed.

    this.isInitialized = false;
    this.initializationPromise = null;

    // Clean up adapter if using new system
    if (this.adapter) {
      await this.adapter.cleanup();
      this.adapter = null;
    }
  }

  private detectRuntime(bundle: ModelBundle): RuntimeType {
    // If bundle has runtime specified, use it
    if (bundle.manifest.runtime) {
      return bundle.manifest.runtime;
    }

    // Auto-detect based on files and manifest
    if (bundle.files) {
      // Check for ONNX model files
      for (const filename of Object.keys(bundle.files)) {
        if (filename.endsWith('.onnx')) {
          return 'onnx';
        }
        if (filename.includes('tensorflow') || filename.includes('tfjs') || filename.endsWith('.json')) {
          return 'tfjs';
        }
      }
    }

    // Check for Python-specific indicators
    if (bundle.manifest.python_version || bundle.manifest.dependencies?.length || bundle.code) {
      return 'pyodide';
    }

    // Use factory's environment detection as fallback
    return this.adapterFactory.detectBestRuntime();
  }

  private createAdapterOptions(): AdapterOptions {
    return {
      enableLogging: this.options.enableLogging || false,
      timeout: this.options.timeout || 60000,
      memoryLimit: this.options.memoryLimit || 512,
      gpuAcceleration: this.options.gpuAcceleration !== false, // Default to true
      pyodideUrl: this.options.pyodideUrl,
      onnxOptions: this.options.onnxOptions,
      tfjsBackend: this.options.tfjsBackend
    };
  }

  private async shouldUseFallback(): Promise<boolean> {
    try {
      // Check for low-end device
      const concurrency = navigator.hardwareConcurrency || 4;
      const deviceMemory = (navigator as any).deviceMemory || 8;

      if (concurrency < 4 || deviceMemory < 4) {
        console.log('Hybrid Resolver: Device considered low-end. using fallback.');
        return true;
      }

      // Check battery status
      if ((navigator as any).getBattery) {
        const battery = await (navigator as any).getBattery();
        if (battery.level < 0.2 && !battery.charging) {
          console.log('Hybrid Resolver: Battery low (<20%). using fallback.');
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  private async executeFallback(input: any): Promise<any> {
    if (!this.options.fallbackUrl) throw new Error('No fallback URL configured');

    this.setStatus('executing');
    try {
      const response = await fetch(this.options.fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`Fallback execution failed: ${response.statusText}`);
      }

      this.setStatus('ready');
      return await response.json();
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }
}