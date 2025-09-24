import React, { useEffect } from 'react';
import { useModel } from '../hooks/useModel';
import type { ModelLoaderProps } from '../types';

export function ModelLoader({ 
  modelUrl, 
  onLoad, 
  onError, 
  children 
}: ModelLoaderProps) {
  const modelResult = useModel(modelUrl);

  useEffect(() => {
    if (modelResult.status === 'ready' && modelResult.model && onLoad) {
      onLoad(modelResult.model);
    }
  }, [modelResult.status, modelResult.model, onLoad]);

  useEffect(() => {
    if (modelResult.status === 'error' && modelResult.error && onError) {
      onError(new Error(modelResult.error.message));
    }
  }, [modelResult.status, modelResult.error, onError]);

  if (children) {
    return <>{children(modelResult)}</>;
  }

  // Default UI
  switch (modelResult.status) {
    case 'loading':
      return <div>Loading Python model...</div>;
    case 'error':
      return <div>Error loading model: {modelResult.error?.message}</div>;
    case 'ready':
      return <div>Model loaded successfully</div>;
    default:
      return <div>Initializing...</div>;
  }
}