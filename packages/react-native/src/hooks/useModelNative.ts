import { useState, useEffect, useCallback } from 'react';
import { PythonReactMLNative } from '../PythonReactMLNative';
import type { NativeModelState, UseModelNativeResult } from '../types';

export function useModelNative(modelPath?: string): UseModelNativeResult {
  const [state, setState] = useState<NativeModelState>({
    modelId: null,
    isLoaded: false,
    isLoading: false,
    error: null
  });

  const loadModel = useCallback(async (path: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Initialize Python engine if not already done
      await PythonReactMLNative.initialize();
      
      // Load the model
      const modelId = await PythonReactMLNative.loadModel(path);
      
      setState(prev => ({
        ...prev,
        modelId,
        isLoaded: true,
        isLoading: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load model';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }));
    }
  }, []);

  const predict = useCallback(async (input: any) => {
    if (!state.modelId) {
      throw new Error('No model loaded');
    }

    try {
      return await PythonReactMLNative.predict(state.modelId, input);
    } catch (error) {
      throw new Error(`Prediction failed: ${error}`);
    }
  }, [state.modelId]);

  const getInfo = useCallback(async () => {
    if (!state.modelId) {
      throw new Error('No model loaded');
    }

    try {
      return await PythonReactMLNative.getModelInfo(state.modelId);
    } catch (error) {
      throw new Error(`Failed to get model info: ${error}`);
    }
  }, [state.modelId]);

  const unload = useCallback(async () => {
    if (state.modelId) {
      await PythonReactMLNative.unloadModel(state.modelId);
      setState(prev => ({
        ...prev,
        modelId: null,
        isLoaded: false,
        error: null
      }));
    }
  }, [state.modelId]);

  const reload = useCallback(async () => {
    if (modelPath) {
      await unload();
      await loadModel(modelPath);
    }
  }, [modelPath, unload, loadModel]);

  // Auto-load model if path is provided
  useEffect(() => {
    if (modelPath && !state.isLoaded && !state.isLoading) {
      loadModel(modelPath);
    }
  }, [modelPath, loadModel, state.isLoaded, state.isLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.modelId) {
        PythonReactMLNative.unloadModel(state.modelId);
      }
    };
  }, []);

  return {
    ...state,
    loadModel,
    predict,
    getInfo,
    unload,
    reload
  };
}