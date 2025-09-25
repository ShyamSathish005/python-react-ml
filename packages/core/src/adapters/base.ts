import { 
  IAdapter, 
  RuntimeType, 
  RuntimeStatus, 
  RuntimeError, 
  ModelBundle, 
  PythonModel, 
  ModelProgress,
  AdapterOptions 
} from '../types';

/**
 * Base adapter class providing common functionality for all runtime adapters
 */
export abstract class BaseAdapter implements IAdapter {
  protected _status: RuntimeStatus = 'idle';
  protected _lastError: RuntimeError | null = null;
  protected _options: AdapterOptions;

  constructor(
    public readonly runtime: RuntimeType,
    options: AdapterOptions = {}
  ) {
    this._options = {
      enableLogging: false,
      memoryLimit: 512 * 1024 * 1024, // 512MB default
      timeout: 30000, // 30 seconds default
      gpuAcceleration: false,
      ...options
    };
  }

  get status(): RuntimeStatus {
    return this._status;
  }

  protected setStatus(status: RuntimeStatus): void {
    const previousStatus = this._status;
    this._status = status;
    
    if (this.onStatusChange && previousStatus !== status) {
      this.onStatusChange(status);
    }
    
    this.log(`Status changed: ${previousStatus} → ${status}`);
  }

  protected setError(error: RuntimeError): void {
    this._lastError = error;
    this.setStatus('error');
    
    if (this.onError) {
      this.onError(error);
    }
    
    this.log(`Error occurred: ${error.message}`, error);
  }

  protected createError(
    type: RuntimeError['type'], 
    message: string, 
    details?: any
  ): RuntimeError {
    return {
      type,
      message,
      details,
      timestamp: new Date().toISOString(),
      stack: new Error().stack
    };
  }

  protected log(message: string, ...args: any[]): void {
    if (this._options.enableLogging) {
      console.log(`[${this.runtime.toUpperCase()}Adapter] ${message}`, ...args);
    }
  }

  protected reportProgress(progress: ModelProgress): void {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }

  // Abstract methods that must be implemented by specific adapters
  abstract initialize(options?: AdapterOptions): Promise<void>;
  abstract load(bundle: ModelBundle): Promise<PythonModel>;
  abstract predict(model: PythonModel, inputs: any): Promise<any>;
  abstract unload(model: PythonModel): Promise<void>;
  abstract cleanup(): Promise<void>;

  // Implemented methods
  getStatus(): RuntimeStatus {
    return this._status;
  }

  getLastError(): RuntimeError | null {
    return this._lastError;
  }

  // Optional event handlers (can be overridden)
  onStatusChange?(status: RuntimeStatus): void;
  onProgress?(progress: ModelProgress): void;
  onError?(error: RuntimeError): void;

  /**
   * Validate model bundle for this adapter
   */
  protected validateBundle(bundle: ModelBundle): void {
    if (!bundle.manifest) {
      throw this.createError('validation', 'Bundle manifest is missing');
    }

    if (bundle.manifest.runtime !== this.runtime) {
      throw this.createError(
        'validation', 
        `Bundle runtime '${bundle.manifest.runtime}' does not match adapter runtime '${this.runtime}'`
      );
    }

    // Validate required fields based on runtime
    this.validateRuntimeSpecificBundle(bundle);
  }

  /**
   * Runtime-specific bundle validation (to be overridden)
   */
  protected validateRuntimeSpecificBundle(bundle: ModelBundle): void {
    // Default implementation - can be overridden by specific adapters
  }

  /**
   * Validate model inputs against schema
   */
  protected validateInputs(inputs: any, manifest: any): void {
    if (!manifest.inputs || !Array.isArray(manifest.inputs)) {
      return; // No validation schema available
    }

    for (const inputSchema of manifest.inputs) {
      if (inputSchema.required && !(inputSchema.name in inputs)) {
        throw this.createError(
          'validation',
          `Required input '${inputSchema.name}' is missing`
        );
      }
    }
  }

  /**
   * Transform outputs according to schema
   */
  protected transformOutputs(outputs: any, manifest: any): any {
    // Default implementation returns outputs as-is
    // Can be overridden for runtime-specific transformations
    return outputs;
  }
}