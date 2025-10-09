import { BaseAdapter } from './base';
import { 
  ModelBundle, 
  PythonModel, 
  AdapterOptions,
  RuntimeError,
  PythonModelManifest
} from '../types';

// TensorFlow.js types (will be provided by @tensorflow/tfjs package)
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
  predict(inputs: Tensor | Tensor[] | {[name: string]: Tensor}, config?: any): Tensor | Tensor[] | {[name: string]: Tensor};
  execute(inputs: Tensor | Tensor[] | {[name: string]: Tensor}, outputs?: string | string[]): Tensor | Tensor[];
  dispose(): void;
  getWeights(): Tensor[];
}

declare global {
  const tf: TensorFlow;
}

/**
 * TensorFlow.js adapter for running TensorFlow models in the browser
 */
export class TFJSAdapter extends BaseAdapter {
  private model: LayersModel | GraphModel | null = null;
  private modelType: 'layers' | 'graph' | null = null;
  private loadedModel: PythonModel | null = null;
  private inputTensors: Tensor[] = [];

  constructor(options: AdapterOptions = {}) {
    super('tfjs', options);
  }

  async initialize(options: AdapterOptions = {}): Promise<void> {
    if (this._status === 'ready') return;
    
    this.setStatus('initializing');
    this.log('Initializing TensorFlow.js adapter...');

    try {
      // Check if TensorFlow.js is available
      if (typeof tf === 'undefined') {
        throw new Error('TensorFlow.js not found. Please ensure @tensorflow/tfjs is loaded.');
      }

      // Merge options
      const mergedOptions = { ...this._options, ...options };
      
      // Set backend if specified
      if (mergedOptions.tfjsBackend) {
        const success = await tf.setBackend(mergedOptions.tfjsBackend);
        if (!success) {
          this.log(`Warning: Failed to set backend to ${mergedOptions.tfjsBackend}, using default`);
        }
      }

      // Wait for TensorFlow.js to be ready
      await tf.ready();
      
      this.log(`TensorFlow.js ready with backend: ${tf.getBackend()}`);
      this.setStatus('ready');
    } catch (error) {
      const runtimeError = this.createError(
        'initialization',
        `Failed to initialize TensorFlow.js: ${error.message}`,
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
      // Extract model file from bundle
      const modelData = this.extractModelData(bundle);
      
      // Determine model type and load accordingly
      const modelFormat = this.detectModelFormat(bundle);
      
      if (modelFormat === 'layers') {
        this.model = await tf.loadLayersModel(modelData);
        this.modelType = 'layers';
      } else {
        this.model = await tf.loadGraphModel(modelData);
        this.modelType = 'graph';
      }

      this.log(`Loaded ${this.modelType} model successfully`);

      // Create model wrapper
      const model: PythonModel = {
        manifest: bundle.manifest,
        predict: async (inputs: any) => this.predict(inputs),
        cleanup: async () => this.unload()
      };

      this.loadedModel = model;
      this.setStatus('ready');
      
      return model;
    } catch (error) {
      const runtimeError = this.createError(
        'loading',
        `Failed to load TensorFlow.js model: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }

  async predict(inputs: any): Promise<any> {
    if (this._status !== 'ready' || !this.model || !this.loadedModel) {
      throw this.createError('execution', 'Model not loaded');
    }

    this.validateInputs(inputs, this.loadedModel.manifest);
    this.setStatus('executing');

    try {
      // Convert inputs to TensorFlow.js tensors
      const inputTensors = this.convertInputsToTensors(inputs, this.loadedModel.manifest);
      
      // Run prediction based on model type
      let prediction: Tensor | Tensor[] | {[name: string]: Tensor};
      
      if (this.modelType === 'layers') {
        const layersModel = this.model as LayersModel;
        // Handle different input formats for layers model
        if (Array.isArray(inputTensors)) {
          prediction = layersModel.predict(inputTensors);
        } else if (inputTensors && typeof inputTensors === 'object' && 'shape' in inputTensors) {
          prediction = layersModel.predict(inputTensors as Tensor);
        } else {
          // Convert named inputs to array for layers model
          prediction = layersModel.predict(Object.values(inputTensors as {[name: string]: Tensor}));
        }
      } else {
        const graphModel = this.model as GraphModel;
        prediction = graphModel.predict(inputTensors);
      }
      
      // Convert outputs back to JavaScript objects
      const outputs = this.convertTensorsToOutputs(prediction, this.loadedModel.manifest);
      
      // Clean up input tensors
      this.disposeInputTensors();
      
      this.setStatus('ready');
      return this.transformOutputs(outputs, this.loadedModel.manifest);
    } catch (error) {
      // Clean up tensors on error
      this.disposeInputTensors();
      
      const runtimeError = this.createError(
        'execution',
        `TensorFlow.js prediction failed: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }

  async unload(): Promise<void> {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.modelType = null;
    this.loadedModel = null;
    this.disposeInputTensors();
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up TensorFlow.js adapter...');
    
    await this.unload();
    
    this.setStatus('idle');
    this.log('TensorFlow.js adapter cleanup complete');
  }

  protected validateRuntimeSpecificBundle(bundle: ModelBundle): void {
    const manifest = bundle.manifest;
    
    if (!manifest.model_file && !bundle.files) {
      throw this.createError(
        'validation', 
        'TensorFlow.js models require model_file field or model files in bundle.files'
      );
    }

    if (manifest.runtime !== 'tfjs') {
      throw this.createError(
        'validation',
        `Expected runtime 'tfjs', got '${manifest.runtime}'`
      );
    }
  }

  private extractModelData(bundle: ModelBundle): ArrayBuffer {
    const manifest = bundle.manifest;
    
    // Try to find model file in bundle.files
    if (bundle.files) {
      const modelFileName = manifest.model_file || 'model.json';
      const modelFile = bundle.files[modelFileName];
      
      if (modelFile) {
        return modelFile;
      }
      
      // Look for common TensorFlow.js model files
      const commonFiles = ['model.json', 'model.pb', 'savedmodel.pb'];
      for (const filename of commonFiles) {
        if (bundle.files[filename]) {
          return bundle.files[filename];
        }
      }
    }
    
    throw this.createError('loading', 'No TensorFlow.js model file found in bundle');
  }

  private detectModelFormat(bundle: ModelBundle): 'layers' | 'graph' {
    const manifest = bundle.manifest as any;
    
    // Check manifest format hint
    if (manifest.model_format) {
      if (manifest.model_format.includes('layers') || manifest.model_format.includes('keras')) {
        return 'layers';
      }
      if (manifest.model_format.includes('graph') || manifest.model_format.includes('savedmodel')) {
        return 'graph';
      }
    }
    
    // Check file extensions
    if (bundle.files) {
      for (const filename of Object.keys(bundle.files)) {
        if (filename.includes('keras') || filename.includes('h5')) {
          return 'layers';
        }
        if (filename.includes('savedmodel') || filename.includes('.pb')) {
          return 'graph';
        }
      }
    }
    
    // Default to layers model
    return 'layers';
  }

  private convertInputsToTensors(inputs: any, manifest: PythonModelManifest): Tensor | Tensor[] | {[name: string]: Tensor} {
    if (!manifest.inputs) {
      throw this.createError('execution', 'Model manifest missing input schema');
    }

    const inputEntries = Object.entries(manifest.inputs);
    
    // Single input case
    if (inputEntries.length === 1) {
      const [inputName, schema] = inputEntries[0];
      const value = inputs[inputName] || inputs;
      const tensor = this.createTensor(value, schema);
      this.inputTensors.push(tensor);
      return tensor;
    }
    
    // Multiple inputs case
    const tensorInputs: {[name: string]: Tensor} = {};
    for (const [inputName, schema] of inputEntries) {
      const value = inputs[inputName];
      if (value === undefined) {
        throw this.createError('execution', `Missing required input: ${inputName}`);
      }
      
      const tensor = this.createTensor(value, schema);
      this.inputTensors.push(tensor);
      tensorInputs[inputName] = tensor;
    }
    
    return tensorInputs;
  }

  private createTensor(data: any, schema: any): Tensor {
    // Handle different input data types
    if (typeof data === 'number') {
      return tf.tensor([data], [1]);
    }
    
    if (Array.isArray(data)) {
      // Use schema shape if available, otherwise infer from data
      const shape = schema.shape || this.inferShape(data);
      const dtype = this.mapDataType(schema.dtype);
      return tf.tensor(data, shape, dtype);
    }
    
    // Handle image data
    if (tf.browser && (data instanceof ImageData || data instanceof HTMLImageElement || 
        data instanceof HTMLCanvasElement || data instanceof HTMLVideoElement)) {
      return tf.browser.fromPixels(data);
    }
    
    throw this.createError('execution', `Unsupported input data type: ${typeof data}`);
  }

  private convertTensorsToOutputs(prediction: Tensor | Tensor[] | {[name: string]: Tensor}, manifest: PythonModelManifest): any {
    // Handle single tensor output
    if (prediction && typeof (prediction as Tensor).arraySync === 'function') {
      const tensor = prediction as Tensor;
      const result = tensor.arraySync();
      return result;
    }
    
    // Handle array of tensors
    if (Array.isArray(prediction)) {
      return prediction.map(tensor => tensor.arraySync());
    }
    
    // Handle named tensor outputs
    if (typeof prediction === 'object') {
      const outputs: any = {};
      for (const [name, tensor] of Object.entries(prediction)) {
        outputs[name] = (tensor as Tensor).arraySync();
      }
      return outputs;
    }
    
    throw this.createError('execution', 'Unexpected prediction format');
  }

  private inferShape(data: any[]): number[] {
    const shape: number[] = [];
    let current = data;
    
    while (Array.isArray(current)) {
      shape.push(current.length);
      current = current[0];
    }
    
    return shape;
  }

  private mapDataType(dtype?: string): string {
    switch (dtype) {
      case 'float32':
      case 'float':
        return 'float32';
      case 'int32':
      case 'int':
        return 'int32';
      case 'bool':
      case 'boolean':
        return 'bool';
      default:
        return 'float32';
    }
  }

  private disposeInputTensors(): void {
    for (const tensor of this.inputTensors) {
      tensor.dispose();
    }
    this.inputTensors = [];
  }
}