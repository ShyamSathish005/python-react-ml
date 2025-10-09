import { BaseAdapter } from './base';
import { 
  ModelBundle, 
  PythonModel, 
  AdapterOptions,
  RuntimeError,
  ModelProgress,
  PythonModelManifest 
} from '../types';

/**
 * Pyodide adapter for running Python models in the browser
 */
export class PyodideAdapter extends BaseAdapter {
  private pyodide: any = null;
  private worker: Worker | null = null;
  private loadedModels = new Map<string, PythonModel>();
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(options: AdapterOptions = {}) {
    super('pyodide', options);
  }

  async initialize(options: AdapterOptions = {}): Promise<void> {
    if (this._status === 'ready') return;
    
    this.setStatus('initializing');
    this.log('Initializing Pyodide adapter...');

    try {
      // Merge options
      const mergedOptions = { ...this._options, ...options };

      if (typeof window !== 'undefined') {
        // Browser environment - use web worker
        await this.initializeWebWorker(mergedOptions);
      } else {
        // Node.js environment - direct initialization
        await this.initializeDirect(mergedOptions);
      }

      this.setStatus('ready');
      this.log('Pyodide adapter initialized successfully');
    } catch (error) {
      const runtimeError = this.createError(
        'initialization',
        `Failed to initialize Pyodide: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }

  private async initializeWebWorker(options: AdapterOptions): Promise<void> {
    // Create web worker for Pyodide
    const workerBlob = new Blob([this.getWorkerScript()], { 
      type: 'application/javascript' 
    });
    const workerUrl = URL.createObjectURL(workerBlob);
    
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = (error) => {
      this.setError(this.createError('initialization', 'Worker error', error));
    };

    // Initialize Pyodide in worker
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      this.pendingRequests.set(requestId, {
        resolve,
        reject: (error) => {
          reject(new Error(error.message || 'Initialization failed'));
        },
        timeout: setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error('Initialization timeout'));
        }, options.timeout || 30000)
      });

      this.worker!.postMessage({
        id: requestId,
        type: 'init',
        payload: {
          pyodideUrl: options.pyodideUrl || 'https://cdn.jsdelivr.net/pyodide/v0.24.0/full/pyodide.js',
          enableLogging: options.enableLogging
        }
      });
    });
  }

  private async initializeDirect(options: AdapterOptions): Promise<void> {
    // Direct initialization for Node.js (requires pyodide-js package)
    throw this.createError(
      'initialization',
      'Direct Pyodide initialization not supported in this environment'
    );
  }

  async load(bundle: ModelBundle): Promise<PythonModel> {
    if (this._status !== 'ready') {
      throw this.createError('loading', 'Adapter not initialized');
    }

    this.validateBundle(bundle);
    this.setStatus('loading');

    try {
      const modelId = `model_${Date.now()}`;
      const model = await this.loadModelInWorker(modelId, bundle);
      
      this.loadedModels.set(modelId, model);
      this.setStatus('ready');
      
      return model;
    } catch (error) {
      const runtimeError = this.createError(
        'loading',
        `Failed to load model: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }

  private async loadModelInWorker(modelId: string, bundle: ModelBundle): Promise<PythonModel> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          const model: PythonModel = {
            manifest: bundle.manifest,
            predict: async (inputs: any) => this.predict(result, inputs),
            cleanup: async () => this.unload(result)
          };
          resolve(model);
        },
        reject,
        timeout: setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error('Model loading timeout'));
        }, this._options.timeout || 30000)
      });

      this.worker.postMessage({
        id: requestId,
        type: 'loadModel',
        payload: {
          modelId,
          manifest: bundle.manifest,
          code: bundle.code,
          files: bundle.files
        }
      });
    });
  }

  async predict(model: PythonModel, inputs: any): Promise<any> {
    if (this._status !== 'ready') {
      throw this.createError('execution', 'Adapter not ready');
    }

    this.validateInputs(inputs, model.manifest);
    this.setStatus('executing');

    try {
      const result = await this.predictInWorker(model, inputs);
      this.setStatus('ready');
      return this.transformOutputs(result, model.manifest);
    } catch (error) {
      const runtimeError = this.createError(
        'execution',
        `Prediction failed: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }

  private async predictInWorker(model: PythonModel, inputs: any): Promise<any> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error('Prediction timeout'));
        }, this._options.timeout || 30000)
      });

      this.worker.postMessage({
        id: requestId,
        type: 'predict',
        payload: { inputs }
      });
    });
  }

  async unload(model: PythonModel): Promise<void> {
    // Find and remove model from loaded models
    for (const [modelId, loadedModel] of this.loadedModels.entries()) {
      if (loadedModel === model) {
        this.loadedModels.delete(modelId);
        
        if (this.worker) {
          this.worker.postMessage({
            id: this.generateRequestId(),
            type: 'unload',
            payload: { modelId }
          });
        }
        break;
      }
    }
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up Pyodide adapter...');
    
    // Clear all pending requests
    for (const [requestId, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Adapter cleanup'));
    }
    this.pendingRequests.clear();

    // Clear loaded models
    this.loadedModels.clear();

    // Terminate worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.setStatus('idle');
    this.log('Pyodide adapter cleanup complete');
  }

  protected validateRuntimeSpecificBundle(bundle: ModelBundle): void {
    const manifest = bundle.manifest;
    
    if (!manifest.entrypoint) {
      throw this.createError('validation', 'Pyodide models require entrypoint field');
    }
    
    if (!manifest.python_version) {
      throw this.createError('validation', 'Pyodide models require python_version field');
    }

    if (!bundle.code) {
      throw this.createError('validation', 'Pyodide models require code field');
    }
  }

  private handleWorkerMessage(event: MessageEvent): void {
    const response = event.data;
    const request = this.pendingRequests.get(response.id);
    
    if (!request) return;
    
    clearTimeout(request.timeout);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      request.reject(new Error(response.error.message || 'Worker error'));
    } else if (response.type === 'progress') {
      this.reportProgress(response.progress);
    } else {
      request.resolve(response.payload);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getWorkerScript(): string {
    return `
// Pyodide Web Worker Script
let pyodide = null;
const loadedModels = new Map();

self.onmessage = async function(e) {
  const { id, type, payload } = e.data;
  
  try {
    switch (type) {
      case 'init':
        await initializePyodide(id, payload);
        break;
      case 'loadModel':
        await loadModel(id, payload);
        break;
      case 'predict':
        await predict(id, payload);
        break;
      case 'unload':
        await unloadModel(id, payload);
        break;
      default:
        throw new Error('Unknown message type: ' + type);
    }
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: {
        type: 'execution',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
};

async function initializePyodide(id, config) {
  if (pyodide) {
    self.postMessage({ id, type: 'initialized' });
    return;
  }

  importScripts(config.pyodideUrl);
  pyodide = await loadPyodide({
    stdout: config.enableLogging ? console.log : undefined,
    stderr: config.enableLogging ? console.error : undefined
  });
  
  self.postMessage({ id, type: 'initialized' });
}

async function loadModel(id, payload) {
  const { modelId, manifest, code, files } = payload;
  
  // Install dependencies
  if (manifest.dependencies && manifest.dependencies.length > 0) {
    await pyodide.loadPackage(['micropip']);
    const micropip = pyodide.pyimport('micropip');
    for (const dep of manifest.dependencies) {
      await micropip.install(dep);
    }
  }
  
  // Load additional files
  if (files) {
    for (const [filename, content] of Object.entries(files)) {
      pyodide.FS.writeFile(filename, new Uint8Array(content));
    }
  }
  
  // Execute model code
  pyodide.runPython(code);
  
  // Store model reference
  loadedModels.set(modelId, { manifest, loaded: true });
  
  self.postMessage({ 
    id, 
    type: 'loaded',
    payload: { modelId }
  });
}

async function predict(id, payload) {
  const { inputs } = payload;
  
  // Convert inputs to Python
  const pyInputs = pyodide.toPy(inputs);
  
  // Call predict function (assuming it exists in the loaded Python code)
  const pyResult = pyodide.globals.get('predict')(pyInputs);
  
  // Convert result back to JavaScript
  const result = pyResult.toJs({ dict_converter: Object.fromEntries });
  
  self.postMessage({
    id,
    type: 'predicted',
    payload: result
  });
}

async function unloadModel(id, payload) {
  const { modelId } = payload;
  loadedModels.delete(modelId);
  
  self.postMessage({
    id,
    type: 'unloaded',
    payload: { modelId }
  });
}
    `;
  }
}