export interface NativeModelOptions {
  modelPath: string;
  enableCaching?: boolean;
}

export interface NativeModelState {
  modelId: string | null;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface UseModelNativeResult extends NativeModelState {
  loadModel: (path: string) => Promise<void>;
  predict: (input: any) => Promise<any>;
  getInfo: () => Promise<any>;
  unload: () => Promise<void>;
  reload: () => Promise<void>;
}