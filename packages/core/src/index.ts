export * from './types';
export * from './pythonEngine';
export * from './modelLoader';

import { PythonEngine } from './pythonEngine';
import { fetchBundle, extractBundle, loadPythonFile } from './modelLoader';
import type { ModelLoadOptions, PythonModel, PythonEngineOptions } from './types';

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
        entry: filePath,
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