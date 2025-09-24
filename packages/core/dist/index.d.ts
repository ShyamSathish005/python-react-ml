interface PythonModelManifest {
    name: string;
    version: string;
    entry: string;
    python_version?: string;
    dependencies?: string[];
    runtime_hints?: {
        pyodide?: boolean;
        native?: boolean;
    };
    sha256?: string;
}
interface PythonModel {
    manifest: PythonModelManifest;
    predict: (input: any) => Promise<any>;
    getInfo?: () => Promise<any>;
    cleanup?: () => void;
}
interface ModelBundle {
    manifest: PythonModelManifest;
    code: string;
    files?: Record<string, ArrayBuffer>;
}
interface PythonEngineOptions {
    platform: 'web' | 'native';
    pyodideUrl?: string;
    enableLogging?: boolean;
}
interface ModelLoadOptions {
    modelUrl?: string;
    entry?: string;
    runtime?: 'auto' | 'pyodide' | 'native';
}
type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';
interface UseModelResult {
    model: PythonModel | null;
    status: ModelStatus;
    error: string | null;
    predict: (input: any) => Promise<any>;
    reload: () => Promise<void>;
}

declare global {
    interface Window {
        loadPyodide: any;
    }
}
declare class PythonEngine {
    private pyodide;
    private isInitialized;
    private worker;
    private options;
    constructor(options: PythonEngineOptions);
    initialize(): Promise<void>;
    private initializeWeb;
    private initializeNative;
    loadModel(bundle: ModelBundle): Promise<PythonModel>;
    private loadModelWeb;
    private loadModelNative;
    private executePython;
    cleanup(): Promise<void>;
}

declare function fetchBundle(url: string): Promise<ArrayBuffer>;
declare function extractBundle(bundleBytes: ArrayBuffer): Promise<ModelBundle>;
declare function loadPythonFile(filePath: string): Promise<{
    code: string;
    manifest?: PythonModelManifest;
}>;

declare class PythonReactML {
    private engine;
    constructor(options?: PythonEngineOptions);
    loadModelFromBundle(url: string): Promise<PythonModel>;
    loadModelFromFile(filePath: string): Promise<PythonModel>;
    cleanup(): Promise<void>;
}
declare function createPythonML(options?: PythonEngineOptions): PythonReactML;

export { ModelBundle, ModelLoadOptions, ModelStatus, PythonEngine, PythonEngineOptions, PythonModel, PythonModelManifest, PythonReactML, UseModelResult, createPythonML, extractBundle, fetchBundle, loadPythonFile };
