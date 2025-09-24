var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  PythonEngine: () => PythonEngine,
  PythonReactML: () => PythonReactML,
  createPythonML: () => createPythonML,
  extractBundle: () => extractBundle,
  fetchBundle: () => fetchBundle,
  loadPythonFile: () => loadPythonFile
});
module.exports = __toCommonJS(src_exports);

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
var import_jszip = __toESM(require("jszip"));
async function fetchBundle(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bundle: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}
async function extractBundle(bundleBytes) {
  const zip = new import_jszip.default();
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PythonEngine,
  PythonReactML,
  createPythonML,
  extractBundle,
  fetchBundle,
  loadPythonFile
});
