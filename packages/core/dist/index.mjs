// src/pythonEngine.ts
var PythonEngine = class {
  constructor(options) {
    this.pyodide = null;
    this.isInitialized = false;
    this.worker = null;
    this.status = "idle";
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.initializationPromise = null;
    this.options = options;
    this.onStatusChange = options.onStatusChange;
  }
  setStatus(status) {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange?.(status);
    }
  }
  getStatus() {
    return this.status;
  }
  async initialize() {
    if (this.isInitialized)
      return;
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    this.initializationPromise = this.performInitialization();
    try {
      await this.initializationPromise;
      this.isInitialized = true;
      this.setStatus("ready");
    } catch (error) {
      this.setStatus("error");
      const runtimeError = {
        type: "initialization",
        message: `Engine initialization failed: ${error.message}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: error
      };
      this.options.onError?.(runtimeError);
      throw runtimeError;
    } finally {
      this.initializationPromise = null;
    }
  }
  async performInitialization() {
    this.setStatus("initializing");
    if (this.options.platform === "web") {
      await this.initializeWeb();
    } else {
      await this.initializeNative();
    }
  }
  async initializeWeb() {
    if (typeof window === "undefined" || !("Worker" in window)) {
      throw new Error("Web Workers not supported in this environment");
    }
    try {
      let workerPath = "/pyodide-worker.js";
      if (typeof window !== "undefined" && window.location) {
        workerPath = new URL("/pyodide-worker.js", window.location.origin).href;
      }
      this.worker = new Worker(workerPath);
    } catch (error) {
      throw new Error(`Failed to create worker: ${error.message}`);
    }
    this.worker.onerror = (error) => {
      const runtimeError = {
        type: "initialization",
        message: `Worker error: ${error.message}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: error
      };
      this.options.onError?.(runtimeError);
    };
    this.worker.addEventListener("message", this.handleWorkerMessage.bind(this));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Worker initialization timeout"));
      }, this.options.timeout || 3e4);
      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout
      });
      const message = {
        id: requestId,
        type: "init",
        payload: {
          pyodideUrl: this.options.pyodideUrl || "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js",
          enableLogging: this.options.enableLogging || false,
          memoryLimit: this.options.memoryLimit
        }
      };
      this.worker.postMessage(message);
    });
  }
  handleWorkerMessage(event) {
    const response = event.data;
    if (response.progress) {
      this.options.onProgress?.(response.progress.progress || 0);
    }
    const pendingRequest = this.pendingRequests.get(response.id);
    if (!pendingRequest) {
      this.handleUnsolicitedMessage(response);
      return;
    }
    this.pendingRequests.delete(response.id);
    clearTimeout(pendingRequest.timeout);
    if (response.type === "error" && response.error) {
      this.options.onError?.(response.error);
      pendingRequest.reject(new Error(response.error.message));
    } else {
      pendingRequest.resolve(response.payload);
    }
  }
  handleUnsolicitedMessage(response) {
    if (response.type === "progress" && response.progress) {
      this.options.onProgress?.(response.progress.progress || 0);
    }
  }
  generateRequestId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
  async initializeNative() {
    throw new Error("Native platform not yet implemented");
  }
  async loadModel(bundle) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (this.options.platform === "web") {
      return this.loadModelWeb(bundle);
    } else {
      return this.loadModelNative(bundle);
    }
  }
  async loadModelWeb(bundle) {
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }
    this.setStatus("loading");
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Model loading timeout"));
      }, this.options.timeout || 6e4);
      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve: (loadResult) => {
          clearTimeout(timeout);
          this.setStatus("ready");
          const model = {
            manifest: bundle.manifest,
            predict: async (input) => {
              this.setStatus("executing");
              try {
                const result = await this.executePython(loadResult.modelId, "predict", input);
                this.setStatus("ready");
                return result;
              } catch (error) {
                this.setStatus("ready");
                throw error;
              }
            },
            getInfo: async () => {
              return this.executePython(loadResult.modelId, "get_model_info", {});
            },
            cleanup: () => {
              const cleanupMessage = {
                id: this.generateRequestId(),
                type: "unload",
                payload: { modelId: loadResult.modelId }
              };
              this.worker?.postMessage(cleanupMessage);
            }
          };
          resolve(model);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.setStatus("error");
          const runtimeError = {
            type: "loading",
            message: `Model loading failed: ${error.message}`,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            details: error
          };
          this.options.onError?.(runtimeError);
          reject(runtimeError);
        },
        timeout
      });
      const message = {
        id: requestId,
        type: "loadModel",
        payload: {
          manifest: bundle.manifest,
          code: bundle.code,
          files: bundle.files
        }
      };
      this.worker.postMessage(message);
    });
  }
  async loadModelNative(bundle) {
    throw new Error("Native model loading not yet implemented");
  }
  async executePython(modelId, functionName, input) {
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Execution timeout for ${functionName}`));
      }, this.options.timeout || 3e4);
      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          const runtimeError = {
            type: "execution",
            message: `Python execution failed: ${error.message}`,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            details: { modelId, functionName, input }
          };
          this.options.onError?.(runtimeError);
          reject(runtimeError);
        },
        timeout
      });
      const message = {
        id: requestId,
        type: "predict",
        payload: {
          modelId,
          functionName,
          input
        }
      };
      this.worker.postMessage(message);
    });
  }
  async cleanup() {
    this.setStatus("terminated");
    for (const [requestId, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Engine terminated"));
    }
    this.pendingRequests.clear();
    if (this.worker) {
      this.worker.removeEventListener("message", this.handleWorkerMessage);
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.initializationPromise = null;
  }
};

// src/modelLoader.ts
import JSZip from "jszip";
async function fetchBundle(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bundle: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}
async function extractBundle(bundleBytes) {
  const zip = new JSZip();
  const zipContents = await zip.loadAsync(bundleBytes);
  const manifestFile = zipContents.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Bundle must contain manifest.json");
  }
  const manifestContent = await manifestFile.async("string");
  const manifest = JSON.parse(manifestContent);
  const entryFile = zipContents.file(manifest.entrypoint);
  if (!entryFile) {
    throw new Error(`Entry file '${manifest.entrypoint}' not found in bundle`);
  }
  const code = await entryFile.async("string");
  const files = {};
  for (const [filename, file] of Object.entries(zipContents.files)) {
    if (filename !== "manifest.json" && filename !== manifest.entrypoint && !file.dir) {
      files[filename] = await file.async("arraybuffer");
    }
  }
  return { manifest, code, files };
}
async function loadPythonFile(filePath) {
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error(`Failed to load Python file: ${response.status} ${response.statusText}`);
  }
  const code = await response.text();
  let manifest;
  try {
    const manifestPath = filePath.replace(/\.py$/, "_manifest.json");
    const manifestResponse = await fetch(manifestPath);
    if (manifestResponse.ok) {
      manifest = await manifestResponse.json();
    }
  } catch {
  }
  return { code, manifest };
}

// src/index.ts
var PythonReactML = class {
  constructor(options = { platform: "web" }) {
    this.engine = new PythonEngine(options);
  }
  async loadModelFromBundle(url) {
    const bundleBytes = await fetchBundle(url);
    const bundle = await extractBundle(bundleBytes);
    return await this.engine.loadModel(bundle);
  }
  async loadModelFromFile(filePath) {
    const { code, manifest } = await loadPythonFile(filePath);
    const bundle = {
      manifest: manifest || {
        name: "custom-model",
        version: "1.0.0",
        entrypoint: filePath,
        python_version: "3.11",
        dependencies: [],
        bundle_version: "1.0",
        files: {},
        sha256: "generated",
        runtime_hints: {
          pyodide: true,
          native: false,
          memory_limit: 512,
          timeout: 30
        },
        functions: {
          predict: {
            description: "Main prediction function",
            inputs: { data: "any" },
            outputs: { result: "any" }
          }
        },
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      code,
      files: {}
    };
    return await this.engine.loadModel(bundle);
  }
  async cleanup() {
    await this.engine.cleanup();
  }
};
function createPythonML(options) {
  return new PythonReactML(options);
}
export {
  PythonEngine,
  PythonReactML,
  createPythonML,
  extractBundle,
  fetchBundle,
  loadPythonFile
};
