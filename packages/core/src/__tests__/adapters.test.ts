/**
 * @jest-environment jsdom
 */
import { RuntimeAdapterFactory } from '../adapters/factory';
import { PyodideAdapter } from '../adapters/pyodide';
import { ONNXAdapter } from '../adapters/onnx';
import { TFJSAdapter } from '../adapters/tfjs';
import { RuntimeType, AdapterOptions, ModelBundle, PythonModelManifest } from '../types';

// Mock global objects for browser environment

beforeAll(() => {
  // @ts-ignore
  const g = global;

  Object.defineProperty(global, 'WebAssembly', {
    value: {
      instantiate: jest.fn(),
    },
    writable: true
  });

  Object.defineProperty(global, 'Worker', {
    value: jest.fn().mockImplementation(() => ({
      postMessage: jest.fn(),
      terminate: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
    writable: true
  });

  // Mock ONNX Runtime
  (global as any).ort = {
    InferenceSession: {
      create: jest.fn().mockResolvedValue({
        run: jest.fn().mockResolvedValue({
          output: {
            data: new Float32Array([1, 2, 3]),
            dims: [1, 3],
            type: 'float32'
          }
        }),
        release: jest.fn()
      })
    },
    Tensor: jest.fn().mockImplementation((type, data, dims) => ({
      type, data, dims
    })),
    env: {
      wasm: {},
      webgl: {}
    }
  };

  // Mock TensorFlow.js
  (global as any).tf = {
    loadLayersModel: jest.fn().mockResolvedValue({
      predict: jest.fn().mockReturnValue({
        arraySync: () => [0.8, 0.2],
        dispose: jest.fn()
      }),
      dispose: jest.fn()
    }),
    loadGraphModel: jest.fn().mockResolvedValue({
      predict: jest.fn().mockReturnValue({
        output: {
          arraySync: () => [0.7, 0.3],
          dispose: jest.fn()
        }
      }),
      dispose: jest.fn()
    }),
    tensor: jest.fn().mockReturnValue({
      arraySync: () => [1, 2, 3],
      dispose: jest.fn()
    }),
    setBackend: jest.fn(),
    ready: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn()
  };
});

// Test data
const mockBundle: ModelBundle = {
  manifest: {
    name: 'test-model',
    version: '1.0.0',
    runtime: 'pyodide' as RuntimeType,
    description: 'Test model',
    entrypoint: 'model.py',
    python_version: '3.11',
    dependencies: ['numpy'],
    bundle_version: '1.0.0',
    sha256: 'test-hash',
    created_at: '2023-01-01T00:00:00Z',
    runtime_hints: {
      pyodide: true,
      memory_limit: 512
    },
    inputs: [{
      name: 'input',
      type: 'array',
      shape: [4],
      dtype: 'float32',
      description: 'Test input'
    }],
    outputs: [{
      name: 'output',
      type: 'array',
      shape: [1],
      dtype: 'float32',
      description: 'Test output'
    }],
    files: {
      'model.py': {
        size: 100,
        sha256: 'file-hash',
        type: 'python'
      }
    }
  },
  code: 'def predict(x): return x',
  files: {}
};

describe('RuntimeAdapterFactory', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create PyodideAdapter for pyodide runtime', () => {
    const factory = RuntimeAdapterFactory.getInstance();
    const adapter = factory.createAdapter('pyodide');
    expect(adapter).toBeInstanceOf(PyodideAdapter);
  });

  it('should create ONNXAdapter for onnx runtime', () => {
    const factory = RuntimeAdapterFactory.getInstance();
    const adapter = factory.createAdapter('onnx');
    expect(adapter).toBeInstanceOf(ONNXAdapter);
  });

  it('should create TFJSAdapter for tfjs runtime', () => {
    const factory = RuntimeAdapterFactory.getInstance();
    const adapter = factory.createAdapter('tfjs');
    expect(adapter).toBeInstanceOf(TFJSAdapter);
  });

  it('should throw error for unsupported runtime', () => {
    const factory = RuntimeAdapterFactory.getInstance();
    expect(() => {
      factory.createAdapter('unknown' as RuntimeType);
    }).toThrow('Unsupported runtime: unknown');
  });
});

describe('PyodideAdapter', () => {
  let adapter: PyodideAdapter;

  beforeEach(() => {
    adapter = new PyodideAdapter();
    jest.clearAllMocks();
  });

  it('should initialize successfully', async () => {
    jest.spyOn(adapter as any, 'initializeWebWorker').mockResolvedValue(undefined);

    await adapter.initialize();
    expect(adapter.getStatus()).toBe('idle');
  });

  it('should validate bundle correctly through load', async () => {
    const validBundle = { ...mockBundle };
    validBundle.manifest.runtime = 'pyodide';

    // Mock initialization
    jest.spyOn(adapter as any, 'initializeWebWorker').mockResolvedValue(undefined);
    await adapter.initialize();

    // Mock load functionality
    jest.spyOn(adapter as any, 'loadModelInWorker').mockResolvedValue({
      manifest: validBundle.manifest,
      predict: jest.fn(),
      cleanup: jest.fn()
    });

    await expect(adapter.load(validBundle)).resolves.toBeDefined();
  });

  it('should reject bundle without entrypoint', async () => {
    const invalidBundle = { ...mockBundle };
    delete invalidBundle.manifest.entrypoint;

    await expect(adapter.load(invalidBundle)).rejects.toThrow('Pyodide models require entrypoint field');
  });

  it('should reject bundle without python_version', async () => {
    const invalidBundle = { ...mockBundle };
    delete invalidBundle.manifest.python_version;

    await expect(adapter.load(invalidBundle)).rejects.toThrow('Pyodide models require python_version field');
  });
});

describe('ONNXAdapter', () => {
  let adapter: ONNXAdapter;

  beforeEach(() => {
    adapter = new ONNXAdapter();
    jest.clearAllMocks();
  });

  it('should initialize successfully when ONNX Runtime is available', async () => {
    await adapter.initialize();
    expect(adapter.getStatus()).toBe('idle');
  });

  it('should handle missing ONNX Runtime', async () => {
    const originalOrt = (global as any).ort;
    delete (global as any).ort;

    await expect(adapter.initialize()).rejects.toThrow('ONNX Runtime not found');

    (global as any).ort = originalOrt;
  });

  it('should validate ONNX bundle correctly through load', async () => {
    const validBundle = { ...mockBundle };
    validBundle.manifest.runtime = 'onnx';
    validBundle.files = { 'model.onnx': new ArrayBuffer(100) };

    // Mock ONNX Runtime
    (global as any).ort = {
      InferenceSession: {
        create: jest.fn().mockResolvedValue({
          run: jest.fn().mockResolvedValue({}),
          inputNames: ['input'],
          outputNames: ['output']
        })
      }
    };

    await expect(adapter.load(validBundle)).resolves.toBeDefined();
  });

  it('should reject bundle without model file', async () => {
    const invalidBundle = { ...mockBundle };
    invalidBundle.manifest.runtime = 'onnx';
    delete invalidBundle.files;

    await expect(adapter.load(invalidBundle)).rejects.toThrow('ONNX models require model_file field or model file in bundle.files');
  });
});

describe('TFJSAdapter', () => {
  let adapter: TFJSAdapter;

  beforeEach(() => {
    adapter = new TFJSAdapter();
    jest.clearAllMocks();
  });

  it('should initialize successfully when TensorFlow.js is available', async () => {
    await adapter.initialize();

    expect((global as any).tf.ready).toHaveBeenCalled();
  });

  it('should handle missing TensorFlow.js', async () => {
    const originalTf = (global as any).tf;
    delete (global as any).tf;

    await expect(adapter.initialize()).rejects.toThrow('TensorFlow.js not found');

    (global as any).tf = originalTf;
  });

  it('should validate TFJS bundle correctly through load', async () => {
    const validBundle = { ...mockBundle };
    validBundle.manifest.runtime = 'tfjs';
    validBundle.files = { 'model.json': new ArrayBuffer(100) };

    // Mock loadLayersModel
    (global as any).tf.loadLayersModel = jest.fn().mockResolvedValue({
      predict: jest.fn().mockReturnValue({}),
      dispose: jest.fn()
    });

    await expect(adapter.load(validBundle)).resolves.toBeDefined();
  });

  it('should set backend if specified', async () => {
    const options: AdapterOptions = {
      tfjsBackend: 'cpu'
    };

    await adapter.initialize(options);
    expect((global as any).tf.setBackend).toHaveBeenCalledWith('cpu');
  });
});

describe('Multi-Runtime Integration', () => {
  it('should support switching between adapters', () => {
    const factory = RuntimeAdapterFactory.getInstance();
    const pyodideAdapter = factory.createAdapter('pyodide');
    const onnxAdapter = factory.createAdapter('onnx');
    const tfjsAdapter = factory.createAdapter('tfjs');

    expect(pyodideAdapter.runtime).toBe('pyodide');
    expect(onnxAdapter.runtime).toBe('onnx');
    expect(tfjsAdapter.runtime).toBe('tfjs');
  });

  it('should handle different bundle types appropriately', async () => {
    const pyodideBundle = { ...mockBundle, manifest: { ...mockBundle.manifest, runtime: 'pyodide' as RuntimeType } };
    const onnxBundle = { ...mockBundle, manifest: { ...mockBundle.manifest, runtime: 'onnx' as RuntimeType } };
    const tfjsBundle = { ...mockBundle, manifest: { ...mockBundle.manifest, runtime: 'tfjs' as RuntimeType } };

    const factory = RuntimeAdapterFactory.getInstance();
    const pyodideAdapter = factory.createAdapter('pyodide');
    const onnxAdapter = factory.createAdapter('onnx');
    const tfjsAdapter = factory.createAdapter('tfjs');

    // Each adapter should only accept its own runtime type
    await expect(pyodideAdapter.load(onnxBundle)).rejects.toThrow();
    await expect(onnxAdapter.load(tfjsBundle)).rejects.toThrow();
    await expect(tfjsAdapter.load(pyodideBundle)).rejects.toThrow();
  });
});

describe('Error Handling', () => {
  it('should handle validation errors properly', async () => {
    const adapter = new PyodideAdapter();
    const invalidBundle = { ...mockBundle };
    delete invalidBundle.manifest.entrypoint;

    await expect(adapter.load(invalidBundle)).rejects.toThrow('Pyodide models require entrypoint field');
  });

  it('should handle initialization errors', async () => {
    const adapter = new ONNXAdapter();

    // Mock ONNX Runtime failure
    (global as any).ort = undefined;

    await expect(adapter.initialize()).rejects.toThrow();
  });

  it('should handle runtime errors during execution', async () => {
    const adapter = new PyodideAdapter();

    // Try to predict without initialization
    const mockInputs = { x: [1, 2, 3, 4] };
    const mockModel = {
      manifest: mockBundle.manifest,
      predict: jest.fn(),
      cleanup: jest.fn()
    };

    await expect(adapter.predict(mockModel, mockInputs)).rejects.toThrow('Adapter not initialized');
  });
});