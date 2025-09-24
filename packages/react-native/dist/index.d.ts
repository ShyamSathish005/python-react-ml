interface NativeModelResult {
    success: boolean;
    result?: any;
    error?: string;
}
declare class PythonReactMLNative {
    static initialize(): Promise<boolean>;
    static loadModel(bundlePath: string): Promise<string>;
    static predict(modelId: string, input: any): Promise<any>;
    static getModelInfo(modelId: string): Promise<any>;
    static unloadModel(modelId: string): Promise<void>;
    static cleanup(): Promise<void>;
}

interface NativeModelOptions {
    modelPath: string;
    enableCaching?: boolean;
}
interface NativeModelState {
    modelId: string | null;
    isLoaded: boolean;
    isLoading: boolean;
    error: string | null;
}
interface UseModelNativeResult extends NativeModelState {
    loadModel: (path: string) => Promise<void>;
    predict: (input: any) => Promise<any>;
    getInfo: () => Promise<any>;
    unload: () => Promise<void>;
    reload: () => Promise<void>;
}

declare function useModelNative(modelPath?: string): UseModelNativeResult;

export { NativeModelOptions, NativeModelResult, NativeModelState, PythonReactMLNative, UseModelNativeResult, useModelNative };
