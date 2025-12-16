import { BaseAdapter } from './base';
import {
  ModelBundle,
  PythonModel,
  AdapterOptions,
  RuntimeError,
  PythonModelManifest
} from '../types';

// Define IOSchema locally for now
interface IOSchema {
  shape: number[];
  dtype: string;
  description?: string;
}

// ONNX Runtime Web types (will be provided by onnxruntime-web package)
interface InferenceSession {
  run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  release(): void;
}

interface Tensor {
  data: Float32Array | Int32Array | BigInt64Array | Uint8Array;
  dims: number[];
  type: string;
}

interface ONNXRuntime {
  InferenceSession: {
    create(model: string | Uint8Array, options?: any): Promise<InferenceSession>;
  };
  Tensor: {
    new(type: string, data: any, dims: number[]): Tensor;
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
export class ONNXAdapter extends BaseAdapter {
  private session: InferenceSession | null = null;
  private model: PythonModel | null = null;
  private inputNames: string[] = [];
  private outputNames: string[] = [];

  constructor(options: AdapterOptions = {}) {
    super('onnx', options);
  }

  async initialize(options: AdapterOptions = {}): Promise<void> {
    if (this._status === 'ready') return;

    this.setStatus('initializing');
    this.log('Initializing ONNX adapter...');

    try {
      // Check if ONNX Runtime is available
      if (typeof ort === 'undefined') {
        throw new Error('ONNX Runtime Web not found. Please ensure onnxruntime-web is loaded.');
      }

      // Merge options
      const mergedOptions = { ...this._options, ...options };

      // Configure ONNX Runtime environment
      if (mergedOptions.onnxOptions) {
        const onnxOpts = mergedOptions.onnxOptions;
        if (onnxOpts.wasmPaths) {
          ort.env.wasm.wasmPaths = onnxOpts.wasmPaths;
        }
        if (onnxOpts.numThreads) {
          ort.env.wasm.numThreads = onnxOpts.numThreads;
        }
      }

      this.setStatus('ready');
      this.log('ONNX adapter initialized successfully');
    } catch (error) {
      const runtimeError = this.createError(
        'initialization',
        `Failed to initialize ONNX Runtime: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }

  async load(bundle: ModelBundle): Promise<PythonModel> {
    if (this._status !== 'ready') {
      throw this.createError('loading', 'Adapter not initialized');
    }

    this.validateBundle(bundle);
    this.setStatus('loading');

    try {
      // Extract ONNX model file from bundle
      const modelFile = this.extractModelFile(bundle);

      // Create inference session
      const providers = await this.getExecutionProviders();
      this.session = await ort.InferenceSession.create(modelFile, {
        executionProviders: providers,
        logSeverityLevel: this._options.enableLogging ? 0 : 2,
        logVerbosityLevel: this._options.enableLogging ? 0 : 1
      });

      // Extract input/output metadata
      this.extractModelMetadata();

      // Create model wrapper
      const model: PythonModel = {
        manifest: bundle.manifest,
        predict: async (inputs: any) => this.predict(inputs),
        cleanup: async () => this.unload(),
        backend: providers[0] // Approximation of active backend
      };

      this.model = model;
      this.setStatus('ready');

      return model;
    } catch (error) {
      const runtimeError = this.createError(
        'loading',
        `Failed to load ONNX model: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }

  async predict(inputs: any): Promise<any> {
    if (this._status !== 'ready' || !this.session || !this.model) {
      throw this.createError('execution', 'Model not loaded');
    }

    this.validateInputs(inputs, this.model.manifest);
    this.setStatus('executing');

    try {
      // Convert inputs to ONNX tensors
      const feeds = this.convertInputsToTensors(inputs, this.model.manifest);

      // Run inference
      const results = await this.session.run(feeds);

      // Convert outputs back to JavaScript objects
      const outputs = this.convertTensorsToOutputs(results, this.model.manifest);

      this.setStatus('ready');
      return this.transformOutputs(outputs, this.model.manifest);
    } catch (error) {
      const runtimeError = this.createError(
        'execution',
        `ONNX inference failed: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }

  async unload(): Promise<void> {
    if (this.session) {
      this.session.release();
      this.session = null;
    }
    this.model = null;
    this.inputNames = [];
    this.outputNames = [];
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up ONNX adapter...');

    await this.unload();

    this.setStatus('idle');
    this.log('ONNX adapter cleanup complete');
  }

  protected validateRuntimeSpecificBundle(bundle: ModelBundle): void {
    const manifest = bundle.manifest;

    if (!manifest.model_file && !bundle.files) {
      throw this.createError(
        'validation',
        'ONNX models require model_file field or model file in bundle.files'
      );
    }

    if (manifest.runtime !== 'onnx') {
      throw this.createError(
        'validation',
        `Expected runtime 'onnx', got '${manifest.runtime}'`
      );
    }
  }

  private extractModelFile(bundle: ModelBundle): Uint8Array {
    const manifest = bundle.manifest;

    // Try to find model file in bundle.files first
    if (bundle.files) {
      const modelFileName = manifest.model_file || 'model.onnx';
      const modelFile = bundle.files[modelFileName];

      if (modelFile) {
        return new Uint8Array(modelFile);
      }

      // Look for any .onnx file
      for (const [filename, content] of Object.entries(bundle.files)) {
        if (filename.endsWith('.onnx')) {
          return new Uint8Array(content);
        }
      }
    }

    throw this.createError('loading', 'No ONNX model file found in bundle');
  }

  private extractModelMetadata(): void {
    if (!this.session) return;

    // Note: ONNX Runtime Web session metadata is typically accessed differently
    // For now, we'll rely on the manifest for input/output names
    this.log('Model metadata extracted from session');
  }

  private convertInputsToTensors(inputs: any, manifest: PythonModelManifest): Record<string, Tensor> {
    const feeds: Record<string, Tensor> = {};

    if (!manifest.inputs) {
      throw this.createError('execution', 'Model manifest missing input schema');
    }

    for (const [inputName, schema] of Object.entries(manifest.inputs)) {
      const value = inputs[inputName];
      if (value === undefined) {
        throw this.createError('execution', `Missing required input: ${inputName}`);
      }

      const tensor = this.createTensor(value, schema);
      feeds[inputName] = tensor;
    }

    return feeds;
  }

  private createTensor(data: any, schema: any): Tensor {
    // Flatten array data if needed
    let flatData: number[];
    let dims: number[];

    if (Array.isArray(data)) {
      flatData = this.flattenArray(data);
      dims = this.getArrayDimensions(data);
    } else if (typeof data === 'number') {
      flatData = [data];
      dims = [1];
    } else {
      throw this.createError('execution', `Unsupported input data type: ${typeof data}`);
    }

    // Convert to appropriate typed array based on schema
    let typedData: Float32Array | Int32Array;
    let tensorType: string;

    switch (schema.dtype) {
      case 'float32':
        typedData = new Float32Array(flatData);
        tensorType = 'float32';
        break;
      case 'int32':
        typedData = new Int32Array(flatData);
        tensorType = 'int32';
        break;
      default:
        // Default to float32
        typedData = new Float32Array(flatData);
        tensorType = 'float32';
    }

    return new ort.Tensor(tensorType, typedData, dims);
  }

  private convertTensorsToOutputs(results: Record<string, Tensor>, manifest: PythonModelManifest): any {
    const outputs: any = {};

    for (const [outputName, tensor] of Object.entries(results)) {
      outputs[outputName] = this.tensorToArray(tensor);
    }

    return outputs;
  }

  private tensorToArray(tensor: Tensor): any {
    // Handle different tensor data types
    let data: number[];

    if (tensor.data instanceof BigInt64Array) {
      // Convert BigInt64Array to regular numbers
      data = Array.from(tensor.data).map(x => Number(x));
    } else {
      // Handle Float32Array, Int32Array, Uint8Array
      data = Array.from(tensor.data as Float32Array | Int32Array | Uint8Array);
    }

    const dims = tensor.dims;

    if (dims.length === 1) {
      return data;
    }

    return this.reshapeArray(data, dims);
  }

  private flattenArray(arr: any[]): number[] {
    const result: number[] = [];

    const flatten = (item: any) => {
      if (Array.isArray(item)) {
        item.forEach(flatten);
      } else {
        result.push(Number(item));
      }
    };

    flatten(arr);
    return result;
  }

  private getArrayDimensions(arr: any[]): number[] {
    const dims: number[] = [];
    let current = arr;

    while (Array.isArray(current)) {
      dims.push(current.length);
      current = current[0];
    }

    return dims;
  }

  private reshapeArray(data: number[], dims: number[]): any {
    if (dims.length === 0) return data[0];
    if (dims.length === 1) return data;

    const [firstDim, ...restDims] = dims;
    const size = restDims.reduce((a, b) => a * b, 1);
    const result = [];

    for (let i = 0; i < firstDim; i++) {
      const slice = data.slice(i * size, (i + 1) * size);
      result.push(this.reshapeArray(slice, restDims));
    }

    return result;
  }

  private async getExecutionProviders(): Promise<string[]> {
    const providers: string[] = [];

    // Add WebGPU provider if available (Priority 1)
    if (await this.isWebGPUAvailable()) {
      providers.push('webgpu');
    }

    // Add WebGL provider if available (Priority 2)
    if (this.isWebGLAvailable()) {
      providers.push('webgl');
    }

    // Add WebAssembly provider (always available, Fallback)
    providers.push('wasm');

    this.log(`Using execution providers: ${providers.join(', ')}`);
    return providers;
  }

  private async isWebGPUAvailable(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !(navigator as any).gpu) return false;
    try {
      // Basic check
      return true;
      // Full check would be await navigator.gpu.requestAdapter(), but that might prompt user or be slow.
      // Presence of navigator.gpu is usually enough indication of support in modern browsers.
    } catch {
      return false;
    }
  }

  private isWebGLAvailable(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }
}