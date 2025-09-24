import { PythonEngine } from '../index';
import { PythonEngineOptions } from '../types';

describe('PythonEngine', () => {
  it('should create instance with web platform', () => {
    const options: PythonEngineOptions = { platform: 'web' };
    const engine = new PythonEngine(options);
    expect(engine).toBeDefined();
  });

  it('should create instance with native platform', () => {
    const options: PythonEngineOptions = { platform: 'native' };
    const engine = new PythonEngine(options);
    expect(engine).toBeDefined();
  });

  it('should handle options correctly', () => {
    const options: PythonEngineOptions = { 
      platform: 'web',
      pyodideUrl: 'custom-url',
      enableLogging: true
    };
    const engine = new PythonEngine(options);
    expect(engine).toBeDefined();
  });
});