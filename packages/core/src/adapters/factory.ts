import { IAdapter, RuntimeType, AdapterOptions, AdapterFactory } from '../types';
import { PyodideAdapter } from './pyodide';
import { ONNXAdapter } from './onnx';
import { TFJSAdapter } from './tfjs';

/**
 * Factory for creating runtime adapters
 */
export class RuntimeAdapterFactory implements AdapterFactory {
  private static instance: RuntimeAdapterFactory;

  static getInstance(): RuntimeAdapterFactory {
    if (!RuntimeAdapterFactory.instance) {
      RuntimeAdapterFactory.instance = new RuntimeAdapterFactory();
    }
    return RuntimeAdapterFactory.instance;
  }

  createAdapter(runtime: RuntimeType, options: AdapterOptions = {}): IAdapter {
    switch (runtime) {
      case 'pyodide':
        return new PyodideAdapter(options);
      
      case 'onnx':
        return new ONNXAdapter(options);
      
      case 'tfjs':
        return new TFJSAdapter(options);
      
      default:
        throw new Error(`Unsupported runtime: ${runtime}`);
    }
  }

  getSupportedRuntimes(): RuntimeType[] {
    return ['pyodide', 'onnx', 'tfjs']; // All three runtimes are implemented
  }

  isRuntimeSupported(runtime: RuntimeType): boolean {
    return this.getSupportedRuntimes().includes(runtime);
  }

  /**
   * Detect the best runtime for the current environment
   */
  detectBestRuntime(): RuntimeType {
    // Check for WebAssembly support (required for ONNX)
    if (typeof WebAssembly !== 'undefined' && typeof window !== 'undefined') {
      // In browser with WASM support, prefer ONNX for performance
      return 'onnx';
    }
    
    // Check for TensorFlow.js availability
    if (typeof window !== 'undefined' && (window as any).tf) {
      return 'tfjs';
    }
    
    // Default to Pyodide (most compatible)
    return 'pyodide';
  }

  /**
   * Get runtime capabilities
   */
  getRuntimeCapabilities(runtime: RuntimeType): {
    gpuAcceleration: boolean;
    webAssembly: boolean;
    pythonSupport: boolean;
    modelFormats: string[];
  } {
    switch (runtime) {
      case 'pyodide':
        return {
          gpuAcceleration: false,
          webAssembly: true,
          pythonSupport: true,
          modelFormats: ['python', 'pickle', 'joblib']
        };
      
      case 'onnx':
        return {
          gpuAcceleration: true,
          webAssembly: true,
          pythonSupport: false,
          modelFormats: ['onnx']
        };
      
      case 'tfjs':
        return {
          gpuAcceleration: true,
          webAssembly: false,
          pythonSupport: false,
          modelFormats: ['tfjs', 'tflite']
        };
      
      default:
        throw new Error(`Unknown runtime: ${runtime}`);
    }
  }
}