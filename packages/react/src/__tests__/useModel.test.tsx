import { useModel } from '../hooks/useModel';

// Mock the core module
jest.mock('python-react-ml', () => ({
  PythonReactML: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    loadModel: jest.fn().mockResolvedValue({ predict: jest.fn() }),
    cleanup: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('React package exports', () => {
  it('should export useModel hook', () => {
    expect(typeof useModel).toBe('function');
  });
});