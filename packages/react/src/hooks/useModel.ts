import { useState, useEffect, useCallback } from 'react';
import { PythonReactML, type PythonModel, type UseModelResult, type ModelStatus } from '@python-react-ml/core';

export function useModel(modelUrl: string): UseModelResult {
  const [model, setModel] = useState<PythonModel | null>(null);
  const [status, setStatus] = useState<ModelStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const engine = new PythonReactML({ platform: 'web' });

  const loadModel = useCallback(async () => {
    if (!modelUrl) return;

    setStatus('loading');
    setError(null);

    try {
      const loadedModel = await engine.loadModelFromBundle(modelUrl);
      setModel(loadedModel);
      setStatus('ready');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load model';
      setError(errorMessage);
      setStatus('error');
      console.error('Model loading failed:', err);
    }
  }, [modelUrl]);

  const predict = useCallback(async (input: any) => {
    if (!model) {
      throw new Error('Model not loaded');
    }
    return await model.predict(input);
  }, [model]);

  const reload = useCallback(async () => {
    setModel(null);
    await loadModel();
  }, [loadModel]);

  useEffect(() => {
    if (modelUrl) {
      loadModel();
    }

    return () => {
      if (model) {
        model.cleanup?.();
      }
      engine.cleanup();
    };
  }, [modelUrl, loadModel]);

  return {
    model,
    status,
    error,
    predict,
    reload
  };
}