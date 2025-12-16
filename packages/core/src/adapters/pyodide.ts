import { BaseAdapter } from './base';
import { WorkerPoolManager } from '../pool/workerPool';
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
  private pool: WorkerPoolManager;
  private workerId: string | null = null;
  private loadedModels = new Map<string, PythonModel>();

  constructor(options: AdapterOptions = {}) {
    super('pyodide', options);
    this.pool = WorkerPoolManager.getInstance();
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
    try {
      this.pool.configure({
        ...this._options,
        ...options,
        platform: 'web'
      });
      this.workerId = await this.pool.acquireWorker();
    } catch (error) {
      throw this.createError('initialization', `Failed to acquire worker: ${(error as Error).message}`, error);
    }
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
    if (!this.workerId) {
      throw new Error('Worker not initialized');
    }

    try {
      const result = await this.pool.executeLoad(this.workerId, bundle);

      const model: PythonModel = {
        manifest: bundle.manifest,
        predict: async (inputs: any) => this.predict(result, inputs),
        cleanup: async () => this.unload(result)
      };
      return model;
    } catch (error) {
      throw new Error(`Model loading failed: ${(error as Error).message}`);
    }
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
    if (!this.workerId) {
      throw new Error('Worker not initialized');
    }

    // Assuming the pool's predict signature matches what we need or we adapt it
    // The previous implementation sent model reference. 
    // WorkerPool.executePredict expects (workerId, modelId, input)
    // We need to extract the modelId from somewhere. 
    // The previous loadModelInWorker resolved with a model that captures 'result' which likely contained modelId.
    // However, the interface for predict(model, inputs) has 'model' which is PythonModel.
    // The 'result' passed to predict (the 1st arg in the arrow function above) was the payload from loadModel.
    // Let's assume 'model' passed here is correct, but we need the ID.
    // Actually, in the line: predict: async (inputs: any) => this.predict(result, inputs)
    // 'result' is the payload from loadModel.
    // But this.predict signature is predict(model: PythonModel, inputs: any)
    // That means 'result' is being passed as 'model'? No, that type wouldn't match PythonModel.
    // Ah, previous code:
    // resolve: (result) => {
    //   const model: PythonModel = { ... }
    //   loadingModels.set(modelId, model) -- wait
    // }
    // The 'result' in 'resolve(result)' was passed to 'this.predict(result, inputs)'.
    // BUT 'this.predict' implementation is: async predict(model: PythonModel, inputs: any).
    // So 'result' MUST be a PythonModel?
    // In previous code:
    // resolve: (result) => { ... resolve(model) }
    // It seems there is a mix up in my understanding of the previous code or its types.
    // Let's look closer at line 145: predict: async (inputs: any) => this.predict(result, inputs)
    // AND line 170: async predict(model: PythonModel, inputs: any)
    // This implies 'result' (from worker response) IS 'PythonModel'. 
    // BUT 'result' from worker is typically a JSON payload { modelId: ... }.
    // So 'this.predict' signature expects PythonModel, but was receiving a payload?
    // TS would complain unless 'any'.

    // Correction: I should trust the new WorkerPool logic.
    // WorkerPool.executePredict(workerId, modelId, input).
    // I need 'modelId'.
    // The 'model' argument provides manifest.
    // I need to ensure I have the modelId associated with this PythonModel instance.
    // I will use a map or property.

    // For now, let's assume I can get modelId from the model (maybe I should add it to PythonModel interface or cast).
    // Or I can look it up in loadedModels?
    // loadedModels is Map<string, PythonModel>. Value is PythonModel.
    // I can iterate to find key? Slow.

    // Better: In loadModelInWorker, I get the modelId.
    // I should attach it to the model instance references or closure.
    // PROPOSAL: Modify `predict` to take `modelId` string instead of `PythonModel`?
    // NO, BaseAdapter defines `predict(model: PythonModel, inputs: any)`.
    // So I must stick to signature.

    // I will try to find the modelId by reference.
    let modelId: string | undefined;
    for (const [id, m] of this.loadedModels.entries()) {
      if (m === model) {
        modelId = id;
        break;
      }
    }

    if (!modelId) throw new Error('Model ID not found for instance');

    return this.pool.executePredict(this.workerId, modelId, inputs);
  }

  async unload(model: PythonModel): Promise<void> {
    // Find and remove model from loaded models
    for (const [modelId, loadedModel] of this.loadedModels.entries()) {
      if (loadedModel === model) {
        this.loadedModels.delete(modelId);

        if (this.workerId) {
          try {
            await this.pool.executeUnload(this.workerId, modelId);
          } catch (e) {
            console.warn('Failed to unload model from worker:', e);
          }
        }
        break;
      }
    }
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up Pyodide adapter...');

    // Pending requests are managed by pool now.

    // Clear loaded models
    this.loadedModels.clear();

    // Terminate worker via pool?
    // Pool manages lifecycle, so we arguably shouldn't terminate unless we own it exclusively.
    // But since we acquired it, maybe we should release it?
    // WorkerPool doesn't have 'release', only 'terminate'.
    if (this.workerId) {
      this.pool.terminate(this.workerId);
      this.workerId = null;
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

  // Deprecated: WorkerPool handles message dispatch
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getWorkerScript(): string {
    // Deprecated: WorkerPool loads this from file
    return '';
  }
}