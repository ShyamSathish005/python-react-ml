// Hooks - Phase 2
export * from './hooks/usePythonEngine';

// Hooks - Phase 2 & 2.5 (useModel and useModelEnhanced)
export { useModel, useModelEnhanced } from './hooks/useModelEnhanced';
export type { UseModelEnhancedOptions, UseModelEnhancedResult } from './hooks/useModelEnhanced';

// Components
export * from './components/PythonModelProvider';
export * from './components/ModelLoader';
export * from './components/ErrorBoundary';

// Types
export * from './types';

// Re-export core types for convenience
export type {
  PythonModel,
  ModelBundle,
  ModelStatus,
  ModelError,
  ModelProgress,
  RuntimeStatus,
  RuntimeError,
  PythonModelManifest
} from 'python-react-ml';

// Re-export Phase 2.5 types
export type {
  ExtendedRuntimeType,
  OptimizationOptions,
  RegistryOptions,
  PrivacyOptions,
  MonitoringOptions,
  RealtimeOptions,
  InferenceMetrics,
  ModelExplanation,
  ExplainabilityMethod,
  DeviceCapabilities,
  WebGPUCapabilities
} from 'python-react-ml';