import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package '@shyamsathish005/python-react-ml-react-native' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'cd ios && pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo managed workflow\n';

const PythonReactML = NativeModules.PythonReactML
  ? NativeModules.PythonReactML
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export interface NativeModelResult {
  success: boolean;
  result?: any;
  error?: string;
}

export class PythonReactMLNative {
  static async initialize(): Promise<boolean> {
    try {
      return await PythonReactML.initialize();
    } catch (error) {
      console.error('Failed to initialize Python engine:', error);
      return false;
    }
  }

  static async loadModel(bundlePath: string): Promise<string> {
    try {
      return await PythonReactML.loadModel(bundlePath);
    } catch (error) {
      throw new Error(`Failed to load model: ${error}`);
    }
  }

  static async predict(modelId: string, input: any): Promise<any> {
    try {
      const result: NativeModelResult = await PythonReactML.predict(modelId, input);
      
      if (result.success) {
        return result.result;
      } else {
        throw new Error(result.error || 'Prediction failed');
      }
    } catch (error) {
      throw new Error(`Prediction failed: ${error}`);
    }
  }

  static async getModelInfo(modelId: string): Promise<any> {
    try {
      const result: NativeModelResult = await PythonReactML.getModelInfo(modelId);
      
      if (result.success) {
        return result.result;
      } else {
        throw new Error(result.error || 'Failed to get model info');
      }
    } catch (error) {
      throw new Error(`Failed to get model info: ${error}`);
    }
  }

  static async unloadModel(modelId: string): Promise<void> {
    try {
      await PythonReactML.unloadModel(modelId);
    } catch (error) {
      console.warn('Failed to unload model:', error);
    }
  }

  static async cleanup(): Promise<void> {
    try {
      await PythonReactML.cleanup();
    } catch (error) {
      console.warn('Failed to cleanup Python engine:', error);
    }
  }
}