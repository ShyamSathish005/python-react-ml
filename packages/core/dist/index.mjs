// src/pythonEngine.ts
var PythonEngine = class {
  constructor(options) {
    this.pyodide = null;
    this.isInitialized = false;
    this.worker = null;
    this.options = options;
  }
  async initialize() {
    if (this.isInitialized)
      return;
    if (this.options.platform === "web") {
      await this.initializeWeb();
    } else {
      await this.initializeNative();
    }
    this.isInitialized = true;
  }
  async initializeWeb() {
    if (typeof window !== "undefined" && "Worker" in window) {
      this.worker = new Worker("/pyodide-worker.js");
    } else {
      throw new Error("Web Workers not supported in this environment");
    }
    return new Promise((resolve, reject) => {
      const handleMessage = (event) => {
        const { type, error } = event.data;
        if (type === "initialized") {
          this.worker?.removeEventListener("message", handleMessage);
          resolve();
        } else if (type === "error") {
          this.worker?.removeEventListener("message", handleMessage);
          reject(new Error(error));
        }
      };
      this.worker.addEventListener("message", handleMessage);
      this.worker.postMessage({
        type: "init",
        pyodideUrl: this.options.pyodideUrl || "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js"
      });
    });
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
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not initialized"));
        return;
      }
      const handleMessage = (event) => {
        const { type, error, modelId } = event.data;
        if (type === "model-loaded") {
          this.worker?.removeEventListener("message", handleMessage);
          const model = {
            manifest: bundle.manifest,
            predict: async (input) => {
              return this.executePython(modelId, "predict", input);
            },
            getInfo: async () => {
              return this.executePython(modelId, "get_model_info", {});
            },
            cleanup: () => {
              this.worker?.postMessage({ type: "cleanup-model", modelId });
            }
          };
          resolve(model);
        } else if (type === "error") {
          this.worker?.removeEventListener("message", handleMessage);
          reject(new Error(error));
        }
      };
      this.worker.addEventListener("message", handleMessage);
      this.worker.postMessage({
        type: "load-model",
        bundle: {
          manifest: bundle.manifest,
          code: bundle.code,
          files: bundle.files
        }
      });
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
      const requestId = Math.random().toString(36).substring(2);
      const handleMessage = (event) => {
        const { type, requestId: responseId, result, error } = event.data;
        if (responseId === requestId) {
          this.worker?.removeEventListener("message", handleMessage);
          if (type === "execution-result") {
            resolve(result);
          } else if (type === "execution-error") {
            reject(new Error(error));
          }
        }
      };
      this.worker.addEventListener("message", handleMessage);
      this.worker.postMessage({
        type: "execute",
        modelId,
        functionName,
        input,
        requestId
      });
    });
  }
  async cleanup() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
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
  const entryFile = zipContents.file(manifest.entry);
  if (!entryFile) {
    throw new Error(`Entry file '${manifest.entry}' not found in bundle`);
  }
  const code = await entryFile.async("string");
  const files = {};
  for (const [filename, file] of Object.entries(zipContents.files)) {
    if (filename !== "manifest.json" && filename !== manifest.entry && !file.dir) {
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
        entry: filePath
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
