/**
 * @jest-environment jsdom
 */
import { RuntimeAdapterFactory } from '../adapters/factory';
import { PyodideAdapter } from '../adapters/pyodide';
import { ONNXAdapter } from '../adapters/onnx';
import { TFJSAdapter } from '../adapters/tfjs';

// Simple smoke tests for the adapter system
describe('Adapter System Integration Tests', () => {
  describe('RuntimeAdapterFactory', () => {
    it('should create PyodideAdapter for pyodide runtime', () => {
      const factory = RuntimeAdapterFactory.getInstance();
      const adapter = factory.createAdapter('pyodide');
      expect(adapter).toBeInstanceOf(PyodideAdapter);
      expect(adapter.runtime).toBe('pyodide');
    });

    it('should create ONNXAdapter for onnx runtime', () => {
      const factory = RuntimeAdapterFactory.getInstance();
      const adapter = factory.createAdapter('onnx');
      expect(adapter).toBeInstanceOf(ONNXAdapter);
      expect(adapter.runtime).toBe('onnx');
    });

    it('should create TFJSAdapter for tfjs runtime', () => {
      const factory = RuntimeAdapterFactory.getInstance();
      const adapter = factory.createAdapter('tfjs');
      expect(adapter).toBeInstanceOf(TFJSAdapter);
      expect(adapter.runtime).toBe('tfjs');
    });

    it('should return singleton instance', () => {
      const factory1 = RuntimeAdapterFactory.getInstance();
      const factory2 = RuntimeAdapterFactory.getInstance();
      expect(factory1).toBe(factory2);
    });
  });

  describe('Adapter Instances', () => {
    it('should create PyodideAdapter with correct properties', () => {
      const adapter = new PyodideAdapter();
      expect(adapter.runtime).toBe('pyodide');
      expect(adapter.getStatus()).toBe('idle');
    });

    it('should create ONNXAdapter with correct properties', () => {
      const adapter = new ONNXAdapter();
      expect(adapter.runtime).toBe('onnx');
      expect(adapter.getStatus()).toBe('idle');
    });

    it('should create TFJSAdapter with correct properties', () => {
      const adapter = new TFJSAdapter();
      expect(adapter.runtime).toBe('tfjs');
      expect(adapter.getStatus()).toBe('idle');
    });
  });

  describe('Multi-Runtime Support', () => {
    it('should support multiple adapters simultaneously', () => {
      const factory = RuntimeAdapterFactory.getInstance();
      const pyodideAdapter = factory.createAdapter('pyodide');
      const onnxAdapter = factory.createAdapter('onnx');
      const tfjsAdapter = factory.createAdapter('tfjs');

      expect(pyodideAdapter.runtime).toBe('pyodide');
      expect(onnxAdapter.runtime).toBe('onnx');
      expect(tfjsAdapter.runtime).toBe('tfjs');

      expect(pyodideAdapter).not.toBe(onnxAdapter);
      expect(onnxAdapter).not.toBe(tfjsAdapter);
    });

    it('should create separate instances for each call', () => {
      const factory = RuntimeAdapterFactory.getInstance();
      const adapter1 = factory.createAdapter('pyodide');
      const adapter2 = factory.createAdapter('pyodide');
      
      expect(adapter1).not.toBe(adapter2);
      expect(adapter1.runtime).toBe(adapter2.runtime);
    });
  });
});