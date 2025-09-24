export * from './types';
export * from './pythonEngine';
export * from './modelLoader';

import { PythonEngine } from './pythonEngine';
import { fetchBundle, extractBundle, loadPythonFile } from './modelLoader';
import type { ModelLoadOptions, PythonModel, PythonEngineOptions, PythonModelManifest } from './types';

export class PythonReactML {
  private engine: PythonEngine;

  constructor(options: PythonEngineOptions = { platform: 'web' }) {
    this.engine = new PythonEngine(options);
  }

  async loadModelFromBundle(url: string): Promise<PythonModel> {
    const bundleBytes = await fetchBundle(url);
    const bundle = await extractBundle(bundleBytes);
    return await this.engine.loadModel(bundle);
  }

  async loadModelFromFile(filePath: string): Promise<PythonModel> {
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
    
    return await this.engine.loadModel(bundle);
  }

  async cleanup(): Promise<void> {
    await this.engine.cleanup();
  }
}

// Factory function for easier usage
export function createPythonML(options?: PythonEngineOptions): PythonReactML {
  return new PythonReactML(options);
}