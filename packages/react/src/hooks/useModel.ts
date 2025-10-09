import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  PythonReactML, 
  type PythonModel, 
  type UseModelResult, 
  type ModelStatus,
  type ModelError,
  type ModelProgress,
  type RuntimeStatus,
  type RuntimeError,
  type PythonEngineOptions,
  type RuntimeType
} from 'python-react-ml';

export interface UseModelOptions {
  /** Auto-load model when URL changes */
  autoLoad?: boolean;
  /** Retry loading on failure */
  retryOnError?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Custom error handler */
  onError?: (error: ModelError | RuntimeError) => void;
  /** Progress callback */
  onProgress?: (progress: ModelProgress) => void;
  /** Python engine platform */
  platform?: 'web' | 'native';
  /** Runtime to use for model execution */
  runtime?: RuntimeType;
  /** Pyodide URL for web platform */
  pyodideUrl?: string;
  /** Enable logging */
  enableLogging?: boolean;
  /** GPU acceleration (ONNX/TFJS) */
  gpuAcceleration?: boolean;
  /** ONNX-specific options */
  onnxOptions?: any;
  /** TensorFlow.js backend */
  tfjsBackend?: string;
  /** Memory limit */
  memoryLimit?: number;
  /** Operation timeout */
  timeout?: number;
}

export function useModel(
  modelUrl: string, 
  options: UseModelOptions = {}
): UseModelResult {
  const {
    autoLoad = true,
    retryOnError = false,
    maxRetries = 3,
    onError,
    onProgress,
    ...engineOptions
  } = options;

  // State
  const [model, setModel] = useState<PythonModel | null>(null);
  const [status, setStatus] = useState<ModelStatus>('idle');
  const [error, setError] = useState<ModelError | null>(null);
  const [progress, setProgress] = useState<ModelProgress>({ status: 'idle' });
  const [isLoading, setIsLoading] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);

  // Refs for stability
  const engineRef = useRef<PythonReactML | null>(null);
  const retryCountRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Create engine instance with status callbacks
  const engine = useMemo(() => {
    const engineConfig: PythonEngineOptions = {
      platform: options.platform || 'web',
      pyodideUrl: options.pyodideUrl,
      enableLogging: options.enableLogging,
      memoryLimit: options.memoryLimit,
      timeout: options.timeout,
      gpuAcceleration: options.gpuAcceleration,
      onnxOptions: options.onnxOptions,
      tfjsBackend: options.tfjsBackend,
      onStatusChange: (runtimeStatus: RuntimeStatus) => {
        // Map runtime status to model status
        const modelStatusMap: Record<RuntimeStatus, ModelStatus> = {
          'idle': 'idle',
          'initializing': 'downloading',
          'ready': 'ready',
          'loading': 'loading',
          'executing': 'ready',
          'error': 'error',
          'terminated': 'idle'
        };
        const mappedStatus = modelStatusMap[runtimeStatus];
        setStatus(mappedStatus);
        setProgress(prev => ({ ...prev, status: mappedStatus }));
      },
      onProgress: (progressValue: number) => {
        const progressData: ModelProgress = {
          status,
          progress: progressValue,
          message: `Progress: ${Math.round(progressValue)}%`
        };
        setProgress(progressData);
        options.onProgress?.(progressData);
      },
      onError: (runtimeError: RuntimeError) => {
        const modelError: ModelError = {
          type: runtimeError.type as ModelError['type'],
          message: runtimeError.message,
          details: runtimeError.details,
          timestamp: runtimeError.timestamp,
          stack: runtimeError.stack,
          pythonTraceback: runtimeError.pythonTraceback
        };
        setError(modelError);
        setStatus('error');
        setProgress(prev => ({ ...prev, status: 'error', error: modelError }));
        onError?.(modelError);
      }
    };

    const newEngine = new PythonReactML(engineConfig);
    engineRef.current = newEngine;
    return newEngine;
  }, [status, options.platform, options.pyodideUrl, options.enableLogging, options.memoryLimit, options.timeout, options.onError, options.onProgress]);

  // Enhanced load function with retry logic
  const loadModel = useCallback(async (url?: string): Promise<void> => {
    const targetUrl = url || modelUrl;
    if (!targetUrl) return;

    // Cancel any ongoing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setStatus('downloading');
    setError(null);
    setProgress({ status: 'downloading', progress: 0, message: 'Starting download...' });

    const attemptLoad = async (attempt: number): Promise<void> => {
      try {
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('Load operation was cancelled');
        }

        setProgress({ 
          status: 'loading', 
          progress: 10, 
          message: `Loading model... (Attempt ${attempt}/${maxRetries + 1})` 
        });

        const loadedModel = await engine.loadModelFromBundle(targetUrl, options.runtime);

        if (abortControllerRef.current?.signal.aborted) {
          loadedModel.cleanup?.();
          throw new Error('Load operation was cancelled');
        }

        setModel(loadedModel);
        setStatus('ready');
        setProgress({ status: 'ready', progress: 100, message: 'Model ready' });
        retryCountRef.current = 0;

      } catch (err) {
        if (abortControllerRef.current?.signal.aborted) {
          return; // Don't handle aborted operations as errors
        }

        const modelError: ModelError = {
          type: 'network',
          message: err instanceof Error ? err.message : 'Failed to load model',
          timestamp: new Date().toISOString(),
          details: { attempt, url: targetUrl, error: err }
        };

        if (retryOnError && attempt <= maxRetries) {
          console.warn(`Model load attempt ${attempt} failed, retrying...`, err);
          setTimeout(() => attemptLoad(attempt + 1), Math.pow(2, attempt) * 1000);
        } else {
          setError(modelError);
          setStatus('error');
          setProgress({ status: 'error', error: modelError });
          console.error('Model loading failed after all retries:', err);
        }
      }
    };

    try {
      await attemptLoad(1);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [modelUrl, engine, retryOnError, maxRetries]);

  // Enhanced predict function with loading state
  const predict = useCallback(async (input: any) => {
    if (!model) {
      const error = new Error('Model not loaded');
      setError({
        type: 'runtime',
        message: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }

    setIsPredicting(true);
    setStatus('ready'); // Keep as ready during prediction
    
    try {
      const result = await model.predict(input);
      return result;
    } catch (err) {
      const modelError: ModelError = {
        type: 'python',
        message: err instanceof Error ? err.message : 'Prediction failed',
        timestamp: new Date().toISOString(),
        details: { input }
      };
      setError(modelError);
      throw modelError;
    } finally {
      setIsPredicting(false);
    }
  }, [model]);

  // Enhanced unload function
  const unload = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (model) {
      try {
        await model.cleanup?.();
      } catch (err) {
        console.warn('Error during model cleanup:', err);
      }
    }

    setModel(null);
    setStatus('idle');
    setError(null);
    setProgress({ status: 'idle' });
    setIsLoading(false);
    setIsPredicting(false);
  }, [model]);

  // Enhanced reload function
  const reload = useCallback(async () => {
    await unload();
    await loadModel();
  }, [unload, loadModel]);

  // Auto-load effect
  useEffect(() => {
    if (modelUrl && autoLoad) {
      loadModel();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [modelUrl, autoLoad, loadModel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unload();
      engineRef.current?.cleanup();
    };
  }, [unload]);

  return {
    model,
    status,
    error,
    predict,
    unload,
    reload,
    progress,
    // Enhanced state information
    isLoading,
    isPredicting,
    isReady: status === 'ready' && !isLoading && !isPredicting,
    hasError: status === 'error' || error !== null,
    // Enhanced actions
    load: loadModel,
    clearError: useCallback(() => setError(null), [])
  };
}