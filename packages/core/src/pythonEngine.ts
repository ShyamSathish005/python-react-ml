import type { 
  PythonModel, 
  ModelBundle, 
  PythonEngineOptions,
  WorkerMessage,
  WorkerResponse,
  RuntimeStatus,
  RuntimeError
} from './types';

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
  private status: RuntimeStatus = 'idle';
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private initializationPromise: Promise<void> | null = null;
  private onStatusChange?: (status: RuntimeStatus) => void;

  constructor(options: PythonEngineOptions) {
    this.options = options;
    this.onStatusChange = options.onStatusChange;
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
      // Try to create worker with fallback paths
      let workerPath = '/pyodide-worker.js'; // Default public path
      
      // Check if we're in a bundled environment
      if (typeof window !== 'undefined' && window.location) {
        // In production, worker should be in public folder
        workerPath = new URL('/pyodide-worker.js', window.location.origin).href;
      }
      
      this.worker = new Worker(workerPath);
    } catch (error) {
      throw new Error(`Failed to create worker: ${(error as Error).message}`);
    }

    // Set up worker error handling
    this.worker.onerror = (error) => {
      const runtimeError: RuntimeError = {
        type: 'initialization',
        message: `Worker error: ${error.message}`,
        timestamp: new Date().toISOString(),
        details: error
      };
      this.options.onError?.(runtimeError);
    };

    this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout'));
      }, this.options.timeout || 30000);

      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout
      });

      const message: WorkerMessage = {
        id: requestId,
        type: 'init',
        payload: {
          pyodideUrl: this.options.pyodideUrl || 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js',
          enableLogging: this.options.enableLogging || false,
          memoryLimit: this.options.memoryLimit
        }
      };

      this.worker!.postMessage(message);
    });
  }

  private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
    const response = event.data;
    
    if (response.progress) {
      this.options.onProgress?.(response.progress.progress || 0);
    }

    const pendingRequest = this.pendingRequests.get(response.id);
    if (!pendingRequest) {
      // Handle unsolicited messages (like status updates)
      this.handleUnsolicitedMessage(response);
      return;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pendingRequest.timeout);

    if (response.type === 'error' && response.error) {
      this.options.onError?.(response.error);
      pendingRequest.reject(new Error(response.error.message));
    } else {
      pendingRequest.resolve(response.payload);
    }
  }

  private handleUnsolicitedMessage(response: WorkerResponse): void {
    // Handle status updates, progress reports, etc.
    if (response.type === 'progress' && response.progress) {
      this.options.onProgress?.(response.progress.progress || 0);
    }
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
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
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    this.setStatus('loading');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Model loading timeout'));
      }, this.options.timeout || 60000);

      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve: (loadResult: any) => {
          clearTimeout(timeout);
          this.setStatus('ready');
          
          const model: PythonModel = {
            manifest: bundle.manifest,
            predict: async (input: any) => {
              this.setStatus('executing');
              try {
                const result = await this.executePython(loadResult.modelId, 'predict', input);
                this.setStatus('ready');
                return result;
              } catch (error) {
                this.setStatus('ready');
                throw error;
              }
            },
            getInfo: async () => {
              return this.executePython(loadResult.modelId, 'get_model_info', {});
            },
            cleanup: () => {
              const cleanupMessage: WorkerMessage = {
                id: this.generateRequestId(),
                type: 'unload',
                payload: { modelId: loadResult.modelId }
              };
              this.worker?.postMessage(cleanupMessage);
            }
          };
          
          resolve(model);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          this.setStatus('error');
          const runtimeError: RuntimeError = {
            type: 'loading',
            message: `Model loading failed: ${error.message}`,
            timestamp: new Date().toISOString(),
            details: error
          };
          this.options.onError?.(runtimeError);
          reject(runtimeError);
        },
        timeout
      });

      const message: WorkerMessage = {
        id: requestId,
        type: 'loadModel',
        payload: {
          manifest: bundle.manifest,
          code: bundle.code,
          files: bundle.files
        }
      };

      this.worker!.postMessage(message);
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
      const timeout = setTimeout(() => {
        reject(new Error(`Execution timeout for ${functionName}`));
      }, this.options.timeout || 30000);

      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve: (result: any) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          const runtimeError: RuntimeError = {
            type: 'execution',
            message: `Python execution failed: ${error.message}`,
            timestamp: new Date().toISOString(),
            details: { modelId, functionName, input }
          };
          this.options.onError?.(runtimeError);
          reject(runtimeError);
        },
        timeout
      });

      const message: WorkerMessage = {
        id: requestId,
        type: 'predict',
        payload: {
          modelId,
          functionName,
          input
        }
      };

      this.worker!.postMessage(message);
    });
  }

  async cleanup(): Promise<void> {
    this.setStatus('terminated');
    
    // Clear all pending requests
    for (const [requestId, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Engine terminated'));
    }
    this.pendingRequests.clear();

    if (this.worker) {
      this.worker.removeEventListener('message', this.handleWorkerMessage);
      this.worker.terminate();
      this.worker = null;
    }
    
    this.isInitialized = false;
    this.initializationPromise = null;
  }
}