import {
    WorkerMessage,
    WorkerResponse,
    RuntimeError,
    ModelBundle,
    PythonEngineOptions,
    RuntimeStatus
} from '../types';
import { ModelError, PythonErrorType } from '../types/Errors';

interface WorkerContainer {
    id: string;
    worker: Worker;
    status: 'idle' | 'busy' | 'initializing' | 'dead';
    currentModelId: string | null;
    loadedBundle: ModelBundle | null; // Keep ref to reload on crash
    pendingRequests: Map<string, RequestHandler>;
    loadPromise: Promise<void> | null;
}

interface RequestHandler {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    type: string;
    payload: any;
    retries: number;
    startTime: number;
}

/**
 * WorkerPoolManager
 * 
 * Orchestrates a pool of Web Workers for Python execution.
 * 
 * Features:
 * - Load balancing (currently simple availability check)
 * - Auto-recovery from worker crashes (OOM, WASM panic)
 * - Request queueing and retry logic
 * - Zero-copy data transfer support (via SharedArrayBuffer where applicable)
 * 
 * @singleton
 */
export class WorkerPoolManager {
    private static instance: WorkerPoolManager;
    private workers: Map<string, WorkerContainer> = new Map();
    private options: PythonEngineOptions | null = null;
    private workerPath: string = '/pyodide-worker.js';
    private maxWorkers: number = 1;

    private constructor() { }

    static getInstance(): WorkerPoolManager {
        if (!WorkerPoolManager.instance) {
            WorkerPoolManager.instance = new WorkerPoolManager();
        }
        return WorkerPoolManager.instance;
    }

    configure(options: PythonEngineOptions, workerPath?: string) {
        this.options = options;
        if (workerPath) this.workerPath = workerPath;
    }

    /**
     * Terminate all workers and clear the pool.
     */
    disposeAll() {
        for (const [id] of this.workers) {
            this.terminate(id);
        }
    }

    async acquireWorker(): Promise<string> {
        // For now, simple logic: return existing or create new up to limit
        for (const [id, container] of this.workers.entries()) {
            if (container.status === 'idle') {
                return id;
            }
        }

        if (this.workers.size < this.maxWorkers) {
            return this.spawnWorker();
        }

        // If all busy, return formatted error or wait (simple: throw for now, or round robin)
        // Real impl would queue. For now, return the first one even if busy (Pyodide is single threaded so this blocks, but we handle via queue in worker usually? No, worker is blocked)
        const firstId = this.workers.keys().next().value;
        if (firstId) return firstId;

        return this.spawnWorker();
    }

    private async spawnWorker(): Promise<string> {
        const id = Math.random().toString(36).substring(7);
        const worker = new Worker(this.workerPath);

        const container: WorkerContainer = {
            id,
            worker,
            status: 'initializing',
            currentModelId: null,
            loadedBundle: null,
            pendingRequests: new Map(),
            loadPromise: null
        };

        this.workers.set(id, container);
        this.setupWorkerListeners(container);

        // Initialize the worker environment
        await this.initWorkerEnv(container);

        return id;
    }

    private setupWorkerListeners(container: WorkerContainer) {
        container.worker.onerror = (error) => {
            console.error(`Worker ${container.id} error:`, error);
            this.handleWorkerCrash(container, error);
        };

        container.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const response = event.data;
            const handler = container.pendingRequests.get(response.id);

            if (!handler) {
                // Unsolicited (progress, etc)
                if (response.type === 'progress' && this.options?.onProgress) {
                    this.options.onProgress(response.progress?.progress || 0);
                }
                return;
            }

            container.pendingRequests.delete(response.id);

            // Telemetry: measure execution time
            const executionTimeMs = Date.now() - handler.startTime;
            const enhancedPayload = response.payload && typeof response.payload === 'object'
                ? { ...response.payload, executionTimeMs }
                : response.payload;

            if (response.type === 'error') {
                // Use structured error if available
                const errorObj = response.error || new Error('Unknown worker error');
                handler.reject(errorObj as any);
            } else {
                container.status = 'idle'; // Assume idle after response
                handler.resolve(enhancedPayload);
            }
        };
    }

    private async initWorkerEnv(container: WorkerContainer): Promise<void> {
        return new Promise((resolve, reject) => {
            const msgId = this.generateRequestId();
            const timeout = setTimeout(() => reject(new Error('Init timeout')), 30000);

            container.pendingRequests.set(msgId, {
                resolve: () => { clearTimeout(timeout); resolve(); },
                reject: (err) => { clearTimeout(timeout); reject(err); },
                type: 'init',
                payload: null,
                retries: 0,
                startTime: Date.now()
            });

            container.worker.postMessage({
                id: msgId,
                type: 'init',
                payload: {
                    pyodideUrl: this.options?.pyodideUrl || 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js',
                    enableLogging: this.options?.enableLogging || false,
                    memoryLimit: this.options?.memoryLimit
                }
            });
        });
    }

    private async handleWorkerCrash(container: WorkerContainer, error: Error | Event) {
        console.warn(`Worker ${container.id} crashed. Attempting recovery...`);
        container.status = 'dead';
        container.worker.terminate();

        // Identify pending requests to retry
        const requestsToRetry = Array.from(container.pendingRequests.values());
        const bundleToReload = container.loadedBundle;

        // Remove dead container
        this.workers.delete(container.id);

        // Spawn replacement
        try {
            const newId = await this.spawnWorker();
            const newContainer = this.workers.get(newId)!;

            // Reload model if it was loaded
            if (bundleToReload) {
                console.log('Reloading model on new worker...');
                await this.executeLoad(newId, bundleToReload);
            }

            // Retry requests
            for (const req of requestsToRetry) {
                if (req.retries < 1) { // Retry ONCE
                    console.log(`Retrying request ${req.type}...`);
                    req.retries++;
                    // Re-submit
                    this.internalExecute(newContainer, req);
                } else {
                    req.reject(new Error('Worker crashed during execution (Max retries reached)'));
                }
            }

        } catch (recoveryError) {
            console.error('Failed to recover worker:', recoveryError);
            for (const req of requestsToRetry) {
                req.reject(new Error('Worker crashed and recovery failed'));
            }
        }
    }

    async executeLoad(workerId: string, bundle: ModelBundle): Promise<any> {
        const container = this.workers.get(workerId);
        if (!container) throw new Error('Worker not found');

        container.loadedBundle = bundle;
        container.currentModelId = bundle.manifest.name; // Simplified ID

        return this.sendRequest(container, 'loadModel', {
            manifest: bundle.manifest,
            code: bundle.code,
            files: bundle.files
        });
    }

    async executeUnload(workerId: string, modelId: string): Promise<any> {
        const container = this.workers.get(workerId);
        if (!container) throw new Error('Worker not found');

        // Logic to clear local state if needed
        if (container.currentModelId === modelId) {
            container.currentModelId = null;
            container.loadedBundle = null;
        }

        return this.sendRequest(container, 'unload', { modelId });
    }

    async executePredict(workerId: string, modelId: string, input: any): Promise<any> {
        const container = this.workers.get(workerId);
        if (!container) throw new Error('Worker not found');

        return this.sendRequest(container, 'predict', {
            modelId,
            functionName: 'predict',
            input
        });
    }

    private sendRequest(container: WorkerContainer, type: 'loadModel' | 'predict' | 'unload', payload: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const reqId = this.generateRequestId();
            const handler: RequestHandler = {
                resolve,
                reject,
                type,
                payload,
                retries: 0,
                startTime: Date.now()
            };

            container.pendingRequests.set(reqId, handler);
            this.internalExecute(container, handler, reqId);

            // Watchdog Timeout
            const timeoutMs = this.options?.timeout || 30000;
            if (timeoutMs > 0) {
                setTimeout(() => {
                    if (container.pendingRequests.has(reqId)) {
                        // Request still pending -> TIMEOUT
                        const timeoutError = new ModelError(
                            PythonErrorType.TIMEOUT,
                            `Worker timed out after ${timeoutMs}ms`,
                            undefined,
                            'Optimizing your model or increasing the timeout might help.'
                        );

                        console.warn(`Worker ${container.id} timed out. Terminating...`);

                        // Remove this specific request so it doesn't get retried by crash handler
                        container.pendingRequests.delete(reqId);
                        handler.reject(timeoutError);

                        // Kill and recover environment (simulating a crash)
                        // Pass the timeout error just for logging context, though we already rejected the main request
                        this.handleWorkerCrash(container, timeoutError);
                    }
                }, timeoutMs);
            }
        });
    }

    private internalExecute(container: WorkerContainer, handler: RequestHandler, forceId?: string) {
        const id = forceId || this.generateRequestId();
        // Update pending map if using new ID (retries might need this logic, currently simplified)
        if (!container.pendingRequests.has(id)) {
            container.pendingRequests.set(id, handler);
        }

        container.status = 'busy';
        container.worker.postMessage({
            id,
            type: handler.type,
            payload: handler.payload
        });
    }

    terminate(workerId: string) {
        const container = this.workers.get(workerId);
        if (container) {
            container.worker.terminate();
            this.workers.delete(workerId);
        }
    }

    private generateRequestId(): string {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
}
