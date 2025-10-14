// Core exports
export * from './types';
export * from './pythonEngine';
export * from './modelLoader';

// Phase 2: Multi-Runtime Adapters
export * from './adapters/factory';
export { BaseAdapter } from './adapters/base';
export { PyodideAdapter } from './adapters/pyodide';
export { ONNXAdapter } from './adapters/onnx';
export { TFJSAdapter } from './adapters/tfjs';

// Phase 2.5: Advanced Features
export * from './types-phase2.5';
export { WebGPUAdapter } from './adapters/webgpu';
export { AutoOptimizer, autoOptimizer } from './optimizer/auto-optimizer';
export { ModelRegistry, modelRegistry } from './registry/model-registry';
export { ModelPipeline, createPipeline } from './pipeline/model-pipeline';
export { PrivacyManager, privacyManager } from './privacy/privacy-manager';
export { ModelMonitor, modelMonitor } from './monitoring/model-monitor';

import { PythonEngine } from './pythonEngine';
import { fetchBundle, extractBundle, loadPythonFile } from './modelLoader';
import type { ModelLoadOptions, PythonModel, PythonEngineOptions, PythonModelManifest, RuntimeType } from './types';

export class PythonReactML {
  private engine: PythonEngine;

  constructor(options: PythonEngineOptions = { platform: 'web' }) {
    this.engine = new PythonEngine(options);
  }

  async loadModelFromBundle(url: string, runtime?: RuntimeType): Promise<PythonModel> {
    const bundleBytes = await fetchBundle(url);
    const bundle = await extractBundle(bundleBytes);
    return await this.engine.loadModel(bundle, runtime);
  }

  async loadModelFromFile(filePath: string, runtime?: RuntimeType): Promise<PythonModel> {
    const { code, manifest } = await loadPythonFile(filePath);
    
    const bundle = {
      manifest: manifest || {
        name: 'custom-model',
        version: '1.0.0',
        entrypoint: filePath,
        python_version: '3.11',
        dependencies: [],
        bundle_version: '1.0',
        files: {},
        sha256: 'generated',
        runtime: runtime || 'pyodide' as RuntimeType,
        inputs: [{
          name: 'data',
          type: 'object' as const,
          dtype: 'float32',
          shape: [1],
          description: 'Input data for prediction'
        }],
        outputs: [{
          name: 'result',
          type: 'object' as const,
          dtype: 'float32', 
          shape: [1],
          description: 'Prediction result'
        }],
        runtime_hints: {
          pyodide: true,
          native: false,
          memory_limit: 512,
          timeout: 30
        },
        functions: {
          predict: {
            description: 'Main prediction function',
            inputs: { data: 'any' },
            outputs: { result: 'any' }
          }
        },
        created_at: new Date().toISOString()
      },
      code,
      files: {}
    };
    
    return await this.engine.loadModel(bundle, runtime);
  }

  async cleanup(): Promise<void> {
    await this.engine.cleanup();
  }
}

// Factory function for easier usage
export function createPythonML(options?: PythonEngineOptions): PythonReactML {
  return new PythonReactML(options);
}