import type { PythonModel, ModelBundle, PythonEngineOptions } from './types';

declare global {
  interface Window {
    loadPyodide: any;
  }
}

export class PythonEngine {
  private pyodide: any = null;
  private isInitialized = false;
  private worker: Worker | null = null;
  private options: PythonEngineOptions;

  constructor(options: PythonEngineOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (this.options.platform === 'web') {
      await this.initializeWeb();
    } else {
      await this.initializeNative();
    }

    this.isInitialized = true;
  }

  private async initializeWeb(): Promise<void> {
    // Load Pyodide in a Web Worker for better performance
    this.worker = new Worker(
      new URL('./pyodide-worker.js', import.meta.url),
      { type: 'module' }
    );

    return new Promise((resolve, reject) => {
      const handleMessage = (event: MessageEvent) => {
        const { type, error } = event.data;
        if (type === 'initialized') {
          this.worker?.removeEventListener('message', handleMessage);
          resolve();
        } else if (type === 'error') {
          this.worker?.removeEventListener('message', handleMessage);
          reject(new Error(error));
        }
      };

      this.worker.addEventListener('message', handleMessage);
      this.worker.postMessage({ 
        type: 'init', 
        pyodideUrl: this.options.pyodideUrl || 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js'
      });
    });
  }

  private async initializeNative(): Promise<void> {
    // This will be implemented with native bridge
    throw new Error('Native platform not yet implemented');
  }

  async loadModel(bundle: ModelBundle): Promise<PythonModel> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.options.platform === 'web') {
      return this.loadModelWeb(bundle);
    } else {
      return this.loadModelNative(bundle);
    }
  }

  private async loadModelWeb(bundle: ModelBundle): Promise<PythonModel> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const handleMessage = (event: MessageEvent) => {
        const { type, error, modelId } = event.data;
        
        if (type === 'model-loaded') {
          this.worker?.removeEventListener('message', handleMessage);
          
          const model: PythonModel = {
            manifest: bundle.manifest,
            predict: async (input: any) => {
              return this.executePython(modelId, 'predict', input);
            },
            getInfo: async () => {
              return this.executePython(modelId, 'get_model_info', {});
            },
            cleanup: () => {
              this.worker?.postMessage({ type: 'cleanup-model', modelId });
            }
          };
          
          resolve(model);
        } else if (type === 'error') {
          this.worker?.removeEventListener('message', handleMessage);
          reject(new Error(error));
        }
      };

      this.worker.addEventListener('message', handleMessage);
      this.worker.postMessage({
        type: 'load-model',
        bundle: {
          manifest: bundle.manifest,
          code: bundle.code,
          files: bundle.files
        }
      });
    });
  }

  private async loadModelNative(bundle: ModelBundle): Promise<PythonModel> {
    // TODO: Implement native model loading
    throw new Error('Native model loading not yet implemented');
  }

  private async executePython(modelId: string, functionName: string, input: any): Promise<any> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(2);
      
      const handleMessage = (event: MessageEvent) => {
        const { type, requestId: responseId, result, error } = event.data;
        
        if (responseId === requestId) {
          this.worker?.removeEventListener('message', handleMessage);
          
          if (type === 'execution-result') {
            resolve(result);
          } else if (type === 'execution-error') {
            reject(new Error(error));
          }
        }
      };

      this.worker.addEventListener('message', handleMessage);
      this.worker.postMessage({
        type: 'execute',
        modelId,
        functionName,
        input,
        requestId
      });
    });
  }

  async cleanup(): Promise<void> {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
  }
}