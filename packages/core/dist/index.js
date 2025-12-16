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
  BaseAdapter: () => BaseAdapter,
  ONNXAdapter: () => ONNXAdapter,
  PyodideAdapter: () => PyodideAdapter,
  PythonEngine: () => PythonEngine,
  PythonReactML: () => PythonReactML,
  RuntimeAdapterFactory: () => RuntimeAdapterFactory,
  TFJSAdapter: () => TFJSAdapter,
  createPythonML: () => createPythonML,
  extractBundle: () => extractBundle,
  fetchBundle: () => fetchBundle,
  loadPythonFile: () => loadPythonFile
});
module.exports = __toCommonJS(src_exports);

// src/adapters/base.ts
var BaseAdapter = class {
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this._status = "idle";
    this._lastError = null;
    this._options = {
      enableLogging: false,
      memoryLimit: 512 * 1024 * 1024,
      // 512MB default
      timeout: 3e4,
      // 30 seconds default
      gpuAcceleration: false,
      ...options
    };
  }
  get status() {
    return this._status;
  }
  setStatus(status) {
    const previousStatus = this._status;
    this._status = status;
    if (this.onStatusChange && previousStatus !== status) {
      this.onStatusChange(status);
    }
    this.log(`Status changed: ${previousStatus} \u2192 ${status}`);
  }
  setError(error) {
    this._lastError = error;
    this.setStatus("error");
    if (this.onError) {
      this.onError(error);
    }
    this.log(`Error occurred: ${error.message}`, error);
  }
  createError(type, message, details) {
    return {
      type,
      message,
      details,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      stack: new Error().stack
    };
  }
  log(message, ...args) {
    if (this._options.enableLogging) {
      console.log(`[${this.runtime.toUpperCase()}Adapter] ${message}`, ...args);
    }
  }
  reportProgress(progress) {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }
  // Implemented methods
  getStatus() {
    return this._status;
  }
  getLastError() {
    return this._lastError;
  }
  /**
   * Validate model bundle for this adapter
   */
  validateBundle(bundle) {
    if (!bundle.manifest) {
      throw this.createError("validation", "Bundle manifest is missing");
    }
    if (bundle.manifest.runtime !== this.runtime) {
      throw this.createError(
        "validation",
        `Bundle runtime '${bundle.manifest.runtime}' does not match adapter runtime '${this.runtime}'`
      );
    }
    this.validateRuntimeSpecificBundle(bundle);
  }
  /**
   * Runtime-specific bundle validation (to be overridden)
   */
  validateRuntimeSpecificBundle(bundle) {
  }
  /**
   * Validate model inputs against schema
   */
  validateInputs(inputs, manifest) {
    if (!manifest.inputs || !Array.isArray(manifest.inputs)) {
      return;
    }
    for (const inputSchema of manifest.inputs) {
      if (inputSchema.required && !(inputSchema.name in inputs)) {
        throw this.createError(
          "validation",
          `Required input '${inputSchema.name}' is missing`
        );
      }
    }
  }
  /**
   * Transform outputs according to schema
   */
  transformOutputs(outputs, manifest) {
    return outputs;
  }
};

// src/types/Errors.ts
var ModelError = class _ModelError extends Error {
  constructor(type, message, pythonTraceback, suggestion) {
    super(message);
    this.name = "ModelError";
    this.type = type;
    this.pythonTraceback = pythonTraceback;
    this.suggestion = suggestion;
  }
  static fromJSON(json) {
    return new _ModelError(
      json.type || "RUNTIME" /* RUNTIME */,
      json.message || "Unknown error",
      json.pythonTraceback,
      json.suggestion
    );
  }
};

// src/pool/workerPool.ts
var WorkerPoolManager = class _WorkerPoolManager {
  constructor() {
    this.workers = /* @__PURE__ */ new Map();
    this.options = null;
    this.workerPath = "/pyodide-worker.js";
    this.maxWorkers = 1;
  }
  static getInstance() {
    if (!_WorkerPoolManager.instance) {
      _WorkerPoolManager.instance = new _WorkerPoolManager();
    }
    return _WorkerPoolManager.instance;
  }
  configure(options, workerPath) {
    this.options = options;
    if (workerPath)
      this.workerPath = workerPath;
  }
  /**
   * Terminate all workers and clear the pool.
   */
  disposeAll() {
    for (const [id] of this.workers) {
      this.terminate(id);
    }
  }
  async acquireWorker() {
    for (const [id, container] of this.workers.entries()) {
      if (container.status === "idle") {
        return id;
      }
    }
    if (this.workers.size < this.maxWorkers) {
      return this.spawnWorker();
    }
    const firstId = this.workers.keys().next().value;
    if (firstId)
      return firstId;
    return this.spawnWorker();
  }
  async spawnWorker() {
    const id = Math.random().toString(36).substring(7);
    const worker = new Worker(this.workerPath);
    const container = {
      id,
      worker,
      status: "initializing",
      currentModelId: null,
      loadedBundle: null,
      pendingRequests: /* @__PURE__ */ new Map(),
      loadPromise: null
    };
    this.workers.set(id, container);
    this.setupWorkerListeners(container);
    await this.initWorkerEnv(container);
    return id;
  }
  setupWorkerListeners(container) {
    container.worker.onerror = (error) => {
      console.error(`Worker ${container.id} error:`, error);
      this.handleWorkerCrash(container, error);
    };
    container.worker.onmessage = (event) => {
      const response = event.data;
      const handler = container.pendingRequests.get(response.id);
      if (!handler) {
        if (response.type === "progress" && this.options?.onProgress) {
          this.options.onProgress(response.progress?.progress || 0);
        }
        return;
      }
      container.pendingRequests.delete(response.id);
      const executionTimeMs = Date.now() - handler.startTime;
      const enhancedPayload = response.payload && typeof response.payload === "object" ? { ...response.payload, executionTimeMs } : response.payload;
      if (response.type === "error") {
        const errorObj = response.error || new Error("Unknown worker error");
        handler.reject(errorObj);
      } else {
        container.status = "idle";
        handler.resolve(enhancedPayload);
      }
    };
  }
  async initWorkerEnv(container) {
    return new Promise((resolve, reject) => {
      const msgId = this.generateRequestId();
      const timeout = setTimeout(() => reject(new Error("Init timeout")), 3e4);
      container.pendingRequests.set(msgId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        type: "init",
        payload: null,
        retries: 0,
        startTime: Date.now()
      });
      container.worker.postMessage({
        id: msgId,
        type: "init",
        payload: {
          pyodideUrl: this.options?.pyodideUrl || "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js",
          enableLogging: this.options?.enableLogging || false,
          memoryLimit: this.options?.memoryLimit
        }
      });
    });
  }
  async handleWorkerCrash(container, error) {
    console.warn(`Worker ${container.id} crashed. Attempting recovery...`);
    container.status = "dead";
    container.worker.terminate();
    const requestsToRetry = Array.from(container.pendingRequests.values());
    const bundleToReload = container.loadedBundle;
    this.workers.delete(container.id);
    try {
      const newId = await this.spawnWorker();
      const newContainer = this.workers.get(newId);
      if (bundleToReload) {
        console.log("Reloading model on new worker...");
        await this.executeLoad(newId, bundleToReload);
      }
      for (const req of requestsToRetry) {
        if (req.retries < 1) {
          console.log(`Retrying request ${req.type}...`);
          req.retries++;
          this.internalExecute(newContainer, req);
        } else {
          req.reject(new Error("Worker crashed during execution (Max retries reached)"));
        }
      }
    } catch (recoveryError) {
      console.error("Failed to recover worker:", recoveryError);
      for (const req of requestsToRetry) {
        req.reject(new Error("Worker crashed and recovery failed"));
      }
    }
  }
  async executeLoad(workerId, bundle) {
    const container = this.workers.get(workerId);
    if (!container)
      throw new Error("Worker not found");
    container.loadedBundle = bundle;
    container.currentModelId = bundle.manifest.name;
    return this.sendRequest(container, "loadModel", {
      manifest: bundle.manifest,
      code: bundle.code,
      files: bundle.files
    });
  }
  async executeUnload(workerId, modelId) {
    const container = this.workers.get(workerId);
    if (!container)
      throw new Error("Worker not found");
    if (container.currentModelId === modelId) {
      container.currentModelId = null;
      container.loadedBundle = null;
    }
    return this.sendRequest(container, "unload", { modelId });
  }
  async executePredict(workerId, modelId, input) {
    const container = this.workers.get(workerId);
    if (!container)
      throw new Error("Worker not found");
    return this.sendRequest(container, "predict", {
      modelId,
      functionName: "predict",
      input
    });
  }
  sendRequest(container, type, payload) {
    return new Promise((resolve, reject) => {
      const reqId = this.generateRequestId();
      const handler = {
        resolve,
        reject,
        type,
        payload,
        retries: 0,
        startTime: Date.now()
      };
      container.pendingRequests.set(reqId, handler);
      this.internalExecute(container, handler, reqId);
      const timeoutMs = this.options?.timeout || 3e4;
      if (timeoutMs > 0) {
        setTimeout(() => {
          if (container.pendingRequests.has(reqId)) {
            const timeoutError = new ModelError(
              "TIMEOUT" /* TIMEOUT */,
              `Worker timed out after ${timeoutMs}ms`,
              void 0,
              "Optimizing your model or increasing the timeout might help."
            );
            console.warn(`Worker ${container.id} timed out. Terminating...`);
            container.pendingRequests.delete(reqId);
            handler.reject(timeoutError);
            this.handleWorkerCrash(container, timeoutError);
          }
        }, timeoutMs);
      }
    });
  }
  internalExecute(container, handler, forceId) {
    const id = forceId || this.generateRequestId();
    if (!container.pendingRequests.has(id)) {
      container.pendingRequests.set(id, handler);
    }
    container.status = "busy";
    container.worker.postMessage({
      id,
      type: handler.type,
      payload: handler.payload
    });
  }
  terminate(workerId) {
    const container = this.workers.get(workerId);
    if (container) {
      container.worker.terminate();
      this.workers.delete(workerId);
    }
  }
  generateRequestId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
};

// src/adapters/pyodide.ts
var PyodideAdapter = class extends BaseAdapter {
  constructor(options = {}) {
    super("pyodide", options);
    this.workerId = null;
    this.loadedModels = /* @__PURE__ */ new Map();
    this.pool = WorkerPoolManager.getInstance();
  }
  async initialize(options = {}) {
    if (this._status === "ready")
      return;
    this.setStatus("initializing");
    this.log("Initializing Pyodide adapter...");
    try {
      const mergedOptions = { ...this._options, ...options };
      if (typeof window !== "undefined") {
        await this.initializeWebWorker(mergedOptions);
      } else {
        await this.initializeDirect(mergedOptions);
      }
      this.setStatus("ready");
      this.log("Pyodide adapter initialized successfully");
    } catch (error) {
      const runtimeError = this.createError(
        "initialization",
        `Failed to initialize Pyodide: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }
  async initializeWebWorker(options) {
    try {
      this.pool.configure({
        ...this._options,
        ...options,
        platform: "web"
      });
      this.workerId = await this.pool.acquireWorker();
    } catch (error) {
      throw this.createError("initialization", `Failed to acquire worker: ${error.message}`, error);
    }
  }
  async initializeDirect(options) {
    throw this.createError(
      "initialization",
      "Direct Pyodide initialization not supported in this environment"
    );
  }
  async load(bundle) {
    if (this._status !== "ready") {
      throw this.createError("loading", "Adapter not initialized");
    }
    this.validateBundle(bundle);
    this.setStatus("loading");
    try {
      const modelId = `model_${Date.now()}`;
      const model = await this.loadModelInWorker(modelId, bundle);
      this.loadedModels.set(modelId, model);
      this.setStatus("ready");
      return model;
    } catch (error) {
      const runtimeError = this.createError(
        "loading",
        `Failed to load model: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }
  async loadModelInWorker(modelId, bundle) {
    if (!this.workerId) {
      throw new Error("Worker not initialized");
    }
    try {
      const result = await this.pool.executeLoad(this.workerId, bundle);
      const model = {
        manifest: bundle.manifest,
        predict: async (inputs) => this.predict(result, inputs),
        cleanup: async () => this.unload(result)
      };
      return model;
    } catch (error) {
      throw new Error(`Model loading failed: ${error.message}`);
    }
  }
  async predict(model, inputs) {
    if (this._status !== "ready") {
      throw this.createError("execution", "Adapter not ready");
    }
    this.validateInputs(inputs, model.manifest);
    this.setStatus("executing");
    try {
      const result = await this.predictInWorker(model, inputs);
      this.setStatus("ready");
      return this.transformOutputs(result, model.manifest);
    } catch (error) {
      const runtimeError = this.createError(
        "execution",
        `Prediction failed: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }
  async predictInWorker(model, inputs) {
    if (!this.workerId) {
      throw new Error("Worker not initialized");
    }
    let modelId;
    for (const [id, m] of this.loadedModels.entries()) {
      if (m === model) {
        modelId = id;
        break;
      }
    }
    if (!modelId)
      throw new Error("Model ID not found for instance");
    return this.pool.executePredict(this.workerId, modelId, inputs);
  }
  async unload(model) {
    for (const [modelId, loadedModel] of this.loadedModels.entries()) {
      if (loadedModel === model) {
        this.loadedModels.delete(modelId);
        if (this.workerId) {
          try {
            await this.pool.executeUnload(this.workerId, modelId);
          } catch (e) {
            console.warn("Failed to unload model from worker:", e);
          }
        }
        break;
      }
    }
  }
  async cleanup() {
    this.log("Cleaning up Pyodide adapter...");
    this.loadedModels.clear();
    if (this.workerId) {
      this.pool.terminate(this.workerId);
      this.workerId = null;
    }
    this.setStatus("idle");
    this.log("Pyodide adapter cleanup complete");
  }
  validateRuntimeSpecificBundle(bundle) {
    const manifest = bundle.manifest;
    if (!manifest.entrypoint) {
      throw this.createError("validation", "Pyodide models require entrypoint field");
    }
    if (!manifest.python_version) {
      throw this.createError("validation", "Pyodide models require python_version field");
    }
    if (!bundle.code) {
      throw this.createError("validation", "Pyodide models require code field");
    }
  }
  // Deprecated: WorkerPool handles message dispatch
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  getWorkerScript() {
    return "";
  }
};

// src/adapters/onnx.ts
var ONNXAdapter = class extends BaseAdapter {
  constructor(options = {}) {
    super("onnx", options);
    this.session = null;
    this.model = null;
    this.inputNames = [];
    this.outputNames = [];
  }
  async initialize(options = {}) {
    if (this._status === "ready")
      return;
    this.setStatus("initializing");
    this.log("Initializing ONNX adapter...");
    try {
      if (typeof ort === "undefined") {
        throw new Error("ONNX Runtime Web not found. Please ensure onnxruntime-web is loaded.");
      }
      const mergedOptions = { ...this._options, ...options };
      if (mergedOptions.onnxOptions) {
        const onnxOpts = mergedOptions.onnxOptions;
        if (onnxOpts.wasmPaths) {
          ort.env.wasm.wasmPaths = onnxOpts.wasmPaths;
        }
        if (onnxOpts.numThreads) {
          ort.env.wasm.numThreads = onnxOpts.numThreads;
        }
      }
      this.setStatus("ready");
      this.log("ONNX adapter initialized successfully");
    } catch (error) {
      const runtimeError = this.createError(
        "initialization",
        `Failed to initialize ONNX Runtime: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }
  async load(bundle) {
    if (this._status !== "ready") {
      throw this.createError("loading", "Adapter not initialized");
    }
    this.validateBundle(bundle);
    this.setStatus("loading");
    try {
      const modelFile = this.extractModelFile(bundle);
      const providers = await this.getExecutionProviders();
      this.session = await ort.InferenceSession.create(modelFile, {
        executionProviders: providers,
        logSeverityLevel: this._options.enableLogging ? 0 : 2,
        logVerbosityLevel: this._options.enableLogging ? 0 : 1
      });
      this.extractModelMetadata();
      const model = {
        manifest: bundle.manifest,
        predict: async (inputs) => this.predict(inputs),
        cleanup: async () => this.unload(),
        backend: providers[0]
        // Approximation of active backend
      };
      this.model = model;
      this.setStatus("ready");
      return model;
    } catch (error) {
      const runtimeError = this.createError(
        "loading",
        `Failed to load ONNX model: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }
  async predict(inputs) {
    if (this._status !== "ready" || !this.session || !this.model) {
      throw this.createError("execution", "Model not loaded");
    }
    this.validateInputs(inputs, this.model.manifest);
    this.setStatus("executing");
    try {
      const feeds = this.convertInputsToTensors(inputs, this.model.manifest);
      const results = await this.session.run(feeds);
      const outputs = this.convertTensorsToOutputs(results, this.model.manifest);
      this.setStatus("ready");
      return this.transformOutputs(outputs, this.model.manifest);
    } catch (error) {
      const runtimeError = this.createError(
        "execution",
        `ONNX inference failed: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }
  async unload() {
    if (this.session) {
      this.session.release();
      this.session = null;
    }
    this.model = null;
    this.inputNames = [];
    this.outputNames = [];
  }
  async cleanup() {
    this.log("Cleaning up ONNX adapter...");
    await this.unload();
    this.setStatus("idle");
    this.log("ONNX adapter cleanup complete");
  }
  validateRuntimeSpecificBundle(bundle) {
    const manifest = bundle.manifest;
    if (!manifest.model_file && !bundle.files) {
      throw this.createError(
        "validation",
        "ONNX models require model_file field or model file in bundle.files"
      );
    }
    if (manifest.runtime !== "onnx") {
      throw this.createError(
        "validation",
        `Expected runtime 'onnx', got '${manifest.runtime}'`
      );
    }
  }
  extractModelFile(bundle) {
    const manifest = bundle.manifest;
    if (bundle.files) {
      const modelFileName = manifest.model_file || "model.onnx";
      const modelFile = bundle.files[modelFileName];
      if (modelFile) {
        return new Uint8Array(modelFile);
      }
      for (const [filename, content] of Object.entries(bundle.files)) {
        if (filename.endsWith(".onnx")) {
          return new Uint8Array(content);
        }
      }
    }
    throw this.createError("loading", "No ONNX model file found in bundle");
  }
  extractModelMetadata() {
    if (!this.session)
      return;
    this.log("Model metadata extracted from session");
  }
  convertInputsToTensors(inputs, manifest) {
    const feeds = {};
    if (!manifest.inputs) {
      throw this.createError("execution", "Model manifest missing input schema");
    }
    for (const [inputName, schema] of Object.entries(manifest.inputs)) {
      const value = inputs[inputName];
      if (value === void 0) {
        throw this.createError("execution", `Missing required input: ${inputName}`);
      }
      const tensor = this.createTensor(value, schema);
      feeds[inputName] = tensor;
    }
    return feeds;
  }
  createTensor(data, schema) {
    let flatData;
    let dims;
    if (Array.isArray(data)) {
      flatData = this.flattenArray(data);
      dims = this.getArrayDimensions(data);
    } else if (typeof data === "number") {
      flatData = [data];
      dims = [1];
    } else {
      throw this.createError("execution", `Unsupported input data type: ${typeof data}`);
    }
    let typedData;
    let tensorType;
    switch (schema.dtype) {
      case "float32":
        typedData = new Float32Array(flatData);
        tensorType = "float32";
        break;
      case "int32":
        typedData = new Int32Array(flatData);
        tensorType = "int32";
        break;
      default:
        typedData = new Float32Array(flatData);
        tensorType = "float32";
    }
    return new ort.Tensor(tensorType, typedData, dims);
  }
  convertTensorsToOutputs(results, manifest) {
    const outputs = {};
    for (const [outputName, tensor] of Object.entries(results)) {
      outputs[outputName] = this.tensorToArray(tensor);
    }
    return outputs;
  }
  tensorToArray(tensor) {
    let data;
    if (tensor.data instanceof BigInt64Array) {
      data = Array.from(tensor.data).map((x) => Number(x));
    } else {
      data = Array.from(tensor.data);
    }
    const dims = tensor.dims;
    if (dims.length === 1) {
      return data;
    }
    return this.reshapeArray(data, dims);
  }
  flattenArray(arr) {
    const result = [];
    const flatten = (item) => {
      if (Array.isArray(item)) {
        item.forEach(flatten);
      } else {
        result.push(Number(item));
      }
    };
    flatten(arr);
    return result;
  }
  getArrayDimensions(arr) {
    const dims = [];
    let current = arr;
    while (Array.isArray(current)) {
      dims.push(current.length);
      current = current[0];
    }
    return dims;
  }
  reshapeArray(data, dims) {
    if (dims.length === 0)
      return data[0];
    if (dims.length === 1)
      return data;
    const [firstDim, ...restDims] = dims;
    const size = restDims.reduce((a, b) => a * b, 1);
    const result = [];
    for (let i = 0; i < firstDim; i++) {
      const slice = data.slice(i * size, (i + 1) * size);
      result.push(this.reshapeArray(slice, restDims));
    }
    return result;
  }
  async getExecutionProviders() {
    const providers = [];
    if (await this.isWebGPUAvailable()) {
      providers.push("webgpu");
    }
    if (this.isWebGLAvailable()) {
      providers.push("webgl");
    }
    providers.push("wasm");
    this.log(`Using execution providers: ${providers.join(", ")}`);
    return providers;
  }
  async isWebGPUAvailable() {
    if (typeof navigator === "undefined" || !navigator.gpu)
      return false;
    try {
      return true;
    } catch {
      return false;
    }
  }
  isWebGLAvailable() {
    try {
      const canvas = document.createElement("canvas");
      return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
    } catch {
      return false;
    }
  }
};

// src/adapters/tfjs.ts
var TFJSAdapter = class extends BaseAdapter {
  constructor(options = {}) {
    super("tfjs", options);
    this.model = null;
    this.modelType = null;
    this.loadedModel = null;
    this.inputTensors = [];
  }
  async initialize(options = {}) {
    if (this._status === "ready")
      return;
    this.setStatus("initializing");
    this.log("Initializing TensorFlow.js adapter...");
    try {
      if (typeof tf === "undefined") {
        throw new Error("TensorFlow.js not found. Please ensure @tensorflow/tfjs is loaded.");
      }
      const mergedOptions = { ...this._options, ...options };
      if (mergedOptions.tfjsBackend) {
        const success = await tf.setBackend(mergedOptions.tfjsBackend);
        if (!success) {
          this.log(`Warning: Failed to set backend to ${mergedOptions.tfjsBackend}, using default`);
        }
      }
      await tf.ready();
      this.log(`TensorFlow.js ready with backend: ${tf.getBackend()}`);
      this.setStatus("ready");
    } catch (error) {
      const runtimeError = this.createError(
        "initialization",
        `Failed to initialize TensorFlow.js: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }
  async load(bundle) {
    if (this._status !== "ready") {
      throw this.createError("loading", "Adapter not initialized");
    }
    this.validateBundle(bundle);
    this.setStatus("loading");
    try {
      const modelData = this.extractModelData(bundle);
      const modelFormat = this.detectModelFormat(bundle);
      if (modelFormat === "layers") {
        this.model = await tf.loadLayersModel(modelData);
        this.modelType = "layers";
      } else {
        this.model = await tf.loadGraphModel(modelData);
        this.modelType = "graph";
      }
      this.log(`Loaded ${this.modelType} model successfully`);
      const model = {
        manifest: bundle.manifest,
        predict: async (inputs) => this.predict(inputs),
        cleanup: async () => this.unload()
      };
      this.loadedModel = model;
      this.setStatus("ready");
      return model;
    } catch (error) {
      const runtimeError = this.createError(
        "loading",
        `Failed to load TensorFlow.js model: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }
  async predict(inputs) {
    if (this._status !== "ready" || !this.model || !this.loadedModel) {
      throw this.createError("execution", "Model not loaded");
    }
    this.validateInputs(inputs, this.loadedModel.manifest);
    this.setStatus("executing");
    try {
      const inputTensors = this.convertInputsToTensors(inputs, this.loadedModel.manifest);
      let prediction;
      if (this.modelType === "layers") {
        const layersModel = this.model;
        if (Array.isArray(inputTensors)) {
          prediction = layersModel.predict(inputTensors);
        } else if (inputTensors && typeof inputTensors === "object" && "shape" in inputTensors) {
          prediction = layersModel.predict(inputTensors);
        } else {
          prediction = layersModel.predict(Object.values(inputTensors));
        }
      } else {
        const graphModel = this.model;
        prediction = graphModel.predict(inputTensors);
      }
      const outputs = this.convertTensorsToOutputs(prediction, this.loadedModel.manifest);
      this.disposeInputTensors();
      this.setStatus("ready");
      return this.transformOutputs(outputs, this.loadedModel.manifest);
    } catch (error) {
      this.disposeInputTensors();
      const runtimeError = this.createError(
        "execution",
        `TensorFlow.js prediction failed: ${error.message}`,
        error
      );
      this.setError(runtimeError);
      throw runtimeError;
    }
  }
  async unload() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.modelType = null;
    this.loadedModel = null;
    this.disposeInputTensors();
  }
  async cleanup() {
    this.log("Cleaning up TensorFlow.js adapter...");
    await this.unload();
    this.setStatus("idle");
    this.log("TensorFlow.js adapter cleanup complete");
  }
  validateRuntimeSpecificBundle(bundle) {
    const manifest = bundle.manifest;
    if (!manifest.model_file && !bundle.files) {
      throw this.createError(
        "validation",
        "TensorFlow.js models require model_file field or model files in bundle.files"
      );
    }
    if (manifest.runtime !== "tfjs") {
      throw this.createError(
        "validation",
        `Expected runtime 'tfjs', got '${manifest.runtime}'`
      );
    }
  }
  extractModelData(bundle) {
    const manifest = bundle.manifest;
    if (bundle.files) {
      const modelFileName = manifest.model_file || "model.json";
      const modelFile = bundle.files[modelFileName];
      if (modelFile) {
        return modelFile;
      }
      const commonFiles = ["model.json", "model.pb", "savedmodel.pb"];
      for (const filename of commonFiles) {
        if (bundle.files[filename]) {
          return bundle.files[filename];
        }
      }
    }
    throw this.createError("loading", "No TensorFlow.js model file found in bundle");
  }
  detectModelFormat(bundle) {
    const manifest = bundle.manifest;
    if (manifest.model_format) {
      if (manifest.model_format.includes("layers") || manifest.model_format.includes("keras")) {
        return "layers";
      }
      if (manifest.model_format.includes("graph") || manifest.model_format.includes("savedmodel")) {
        return "graph";
      }
    }
    if (bundle.files) {
      for (const filename of Object.keys(bundle.files)) {
        if (filename.includes("keras") || filename.includes("h5")) {
          return "layers";
        }
        if (filename.includes("savedmodel") || filename.includes(".pb")) {
          return "graph";
        }
      }
    }
    return "layers";
  }
  convertInputsToTensors(inputs, manifest) {
    if (!manifest.inputs) {
      throw this.createError("execution", "Model manifest missing input schema");
    }
    const inputEntries = Object.entries(manifest.inputs);
    if (inputEntries.length === 1) {
      const [inputName, schema] = inputEntries[0];
      const value = inputs[inputName] || inputs;
      const tensor = this.createTensor(value, schema);
      this.inputTensors.push(tensor);
      return tensor;
    }
    const tensorInputs = {};
    for (const [inputName, schema] of inputEntries) {
      const value = inputs[inputName];
      if (value === void 0) {
        throw this.createError("execution", `Missing required input: ${inputName}`);
      }
      const tensor = this.createTensor(value, schema);
      this.inputTensors.push(tensor);
      tensorInputs[inputName] = tensor;
    }
    return tensorInputs;
  }
  createTensor(data, schema) {
    if (typeof data === "number") {
      return tf.tensor([data], [1]);
    }
    if (Array.isArray(data)) {
      const shape = schema.shape || this.inferShape(data);
      const dtype = this.mapDataType(schema.dtype);
      return tf.tensor(data, shape, dtype);
    }
    if (tf.browser && (data instanceof ImageData || data instanceof HTMLImageElement || data instanceof HTMLCanvasElement || data instanceof HTMLVideoElement)) {
      return tf.browser.fromPixels(data);
    }
    throw this.createError("execution", `Unsupported input data type: ${typeof data}`);
  }
  convertTensorsToOutputs(prediction, manifest) {
    if (prediction && typeof prediction.arraySync === "function") {
      const tensor = prediction;
      const result = tensor.arraySync();
      return result;
    }
    if (Array.isArray(prediction)) {
      return prediction.map((tensor) => tensor.arraySync());
    }
    if (typeof prediction === "object") {
      const outputs = {};
      for (const [name, tensor] of Object.entries(prediction)) {
        outputs[name] = tensor.arraySync();
      }
      return outputs;
    }
    throw this.createError("execution", "Unexpected prediction format");
  }
  inferShape(data) {
    const shape = [];
    let current = data;
    while (Array.isArray(current)) {
      shape.push(current.length);
      current = current[0];
    }
    return shape;
  }
  mapDataType(dtype) {
    switch (dtype) {
      case "float32":
      case "float":
        return "float32";
      case "int32":
      case "int":
        return "int32";
      case "bool":
      case "boolean":
        return "bool";
      default:
        return "float32";
    }
  }
  disposeInputTensors() {
    for (const tensor of this.inputTensors) {
      tensor.dispose();
    }
    this.inputTensors = [];
  }
};

// src/adapters/factory.ts
var RuntimeAdapterFactory = class _RuntimeAdapterFactory {
  static getInstance() {
    if (!_RuntimeAdapterFactory.instance) {
      _RuntimeAdapterFactory.instance = new _RuntimeAdapterFactory();
    }
    return _RuntimeAdapterFactory.instance;
  }
  createAdapter(runtime, options = {}) {
    switch (runtime) {
      case "pyodide":
        return new PyodideAdapter(options);
      case "onnx":
        return new ONNXAdapter(options);
      case "tfjs":
        return new TFJSAdapter(options);
      default:
        throw new Error(`Unsupported runtime: ${runtime}`);
    }
  }
  getSupportedRuntimes() {
    return ["pyodide", "onnx", "tfjs"];
  }
  isRuntimeSupported(runtime) {
    return this.getSupportedRuntimes().includes(runtime);
  }
  /**
   * Detect the best runtime for the current environment
   */
  detectBestRuntime() {
    if (typeof WebAssembly !== "undefined" && typeof window !== "undefined") {
      return "onnx";
    }
    if (typeof window !== "undefined" && window.tf) {
      return "tfjs";
    }
    return "pyodide";
  }
  /**
   * Get runtime capabilities
   */
  getRuntimeCapabilities(runtime) {
    switch (runtime) {
      case "pyodide":
        return {
          gpuAcceleration: false,
          webAssembly: true,
          pythonSupport: true,
          modelFormats: ["python", "pickle", "joblib"]
        };
      case "onnx":
        return {
          gpuAcceleration: true,
          webAssembly: true,
          pythonSupport: false,
          modelFormats: ["onnx"]
        };
      case "tfjs":
        return {
          gpuAcceleration: true,
          webAssembly: false,
          pythonSupport: false,
          modelFormats: ["tfjs", "tflite"]
        };
      default:
        throw new Error(`Unknown runtime: ${runtime}`);
    }
  }
};

// src/pythonEngine.ts
var PythonEngine = class {
  constructor(options) {
    this.adapter = null;
    this.isInitialized = false;
    this.status = "idle";
    this.initializationPromise = null;
    // Legacy support - kept for backward compatibility
    this.pyodide = null;
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.options = options;
    this.onStatusChange = options.onStatusChange;
    this.adapterFactory = RuntimeAdapterFactory.getInstance();
    this.pool = WorkerPoolManager.getInstance();
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
      this.pool.configure(this.options, workerPath);
    } catch (error) {
      throw new Error(`Failed to initialize worker pool: ${error.message}`);
    }
  }
  handleWorkerMessage(event) {
  }
  handleUnsolicitedMessage(response) {
  }
  generateRequestId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
  async initializeNative() {
    throw new Error("Native platform not yet implemented");
  }
  async loadModel(bundle, runtimeOverride) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const runtime = runtimeOverride || bundle.manifest.runtime || this.detectRuntime(bundle);
    if (!this.adapter || this.adapter.runtime !== runtime) {
      if (this.adapter) {
        await this.adapter.cleanup();
      }
      const adapterOptions = this.createAdapterOptions();
      this.adapter = this.adapterFactory.createAdapter(runtime, adapterOptions);
      await this.adapter.initialize(adapterOptions);
    }
    this.setStatus("loading");
    try {
      const model = await this.adapter.load(bundle);
      this.setStatus("ready");
      if (this.options.fallbackUrl) {
        const originalPredict = model.predict.bind(model);
        model.predict = async (input) => {
          if (await this.shouldUseFallback()) {
            return this.executeFallback(input);
          }
          return originalPredict(input);
        };
      }
      return model;
    } catch (error) {
      this.setStatus("error");
      throw error;
    }
  }
  // Legacy methods removed (loadModelWeb, executePython)
  async cleanup() {
    this.setStatus("terminated");
    for (const [requestId, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Engine terminated"));
    }
    this.pendingRequests.clear();
    this.isInitialized = false;
    this.initializationPromise = null;
    if (this.adapter) {
      await this.adapter.cleanup();
      this.adapter = null;
    }
  }
  detectRuntime(bundle) {
    if (bundle.manifest.runtime) {
      return bundle.manifest.runtime;
    }
    if (bundle.files) {
      for (const filename of Object.keys(bundle.files)) {
        if (filename.endsWith(".onnx")) {
          return "onnx";
        }
        if (filename.includes("tensorflow") || filename.includes("tfjs") || filename.endsWith(".json")) {
          return "tfjs";
        }
      }
    }
    if (bundle.manifest.python_version || bundle.manifest.dependencies?.length || bundle.code) {
      return "pyodide";
    }
    return this.adapterFactory.detectBestRuntime();
  }
  createAdapterOptions() {
    return {
      enableLogging: this.options.enableLogging || false,
      timeout: this.options.timeout || 6e4,
      memoryLimit: this.options.memoryLimit || 512,
      gpuAcceleration: this.options.gpuAcceleration !== false,
      // Default to true
      pyodideUrl: this.options.pyodideUrl,
      onnxOptions: this.options.onnxOptions,
      tfjsBackend: this.options.tfjsBackend
    };
  }
  async shouldUseFallback() {
    try {
      const concurrency = navigator.hardwareConcurrency || 4;
      const deviceMemory = navigator.deviceMemory || 8;
      if (concurrency < 4 || deviceMemory < 4) {
        console.log("Hybrid Resolver: Device considered low-end. using fallback.");
        return true;
      }
      if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        if (battery.level < 0.2 && !battery.charging) {
          console.log("Hybrid Resolver: Battery low (<20%). using fallback.");
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }
  async executeFallback(input) {
    if (!this.options.fallbackUrl)
      throw new Error("No fallback URL configured");
    this.setStatus("executing");
    try {
      const response = await fetch(this.options.fallbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(`Fallback execution failed: ${response.statusText}`);
      }
      this.setStatus("ready");
      return await response.json();
    } catch (error) {
      this.setStatus("error");
      throw error;
    }
  }
};

// src/modelLoader.ts
var import_jszip = __toESM(require("jszip"));

// src/cache/modelCache.ts
var DB_NAME = "PythonReactML_Cache";
var STORE_NAME = "models";
var DB_VERSION = 1;
var ModelCache = class {
  constructor() {
    this.db = null;
    this.isSupported = typeof indexedDB !== "undefined";
  }
  async initialize() {
    if (!this.isSupported)
      return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
    });
  }
  async get(url) {
    if (!this.db)
      await this.initialize();
    if (!this.db)
      return null;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }
  async put(url, data, headers) {
    if (!this.db)
      await this.initialize();
    if (!this.db)
      return;
    const cachedItem = {
      key: url,
      data,
      headers: {
        etag: headers.get("etag"),
        lastModified: headers.get("last-modified"),
        contentType: headers.get("content-type")
      },
      timestamp: Date.now()
    };
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(cachedItem);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
  async validateAndLoad(url) {
    const cached = await this.get(url);
    if (!cached)
      return null;
    try {
      const response = await fetch(url, { method: "HEAD" });
      const serverETag = response.headers.get("etag");
      const serverLastModified = response.headers.get("last-modified");
      if (serverETag && cached.headers.etag) {
        if (serverETag === cached.headers.etag) {
          console.log(`[Cache] Cache hit (ETag match): ${url}`);
          return cached.data;
        }
      } else if (serverLastModified && cached.headers.lastModified) {
        const serverDate = new Date(serverLastModified).getTime();
        const cachedDate = new Date(cached.headers.lastModified).getTime();
        if (serverDate <= cachedDate) {
          console.log(`[Cache] Cache hit (Not modified): ${url}`);
          return cached.data;
        }
      } else {
      }
      console.log(`[Cache] Cache miss (Changed or invalid): ${url}`);
      return null;
    } catch (error) {
      console.warn(`[Cache] Network validation failed, serving cached content:`, error);
      return cached.data;
    }
  }
};

// src/modelLoader.ts
var cache = new ModelCache();
async function fetchBundle(url) {
  try {
    const cachedData = await cache.validateAndLoad(url);
    if (cachedData) {
      return cachedData;
    }
  } catch (e) {
    console.warn("Cache lookup failed, falling back to network", e);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bundle: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  try {
    await cache.put(url, buffer, response.headers);
  } catch (e) {
    console.warn("Failed to cache bundle", e);
  }
  return buffer;
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
  async loadModelFromBundle(url, runtime) {
    const bundleBytes = await fetchBundle(url);
    const bundle = await extractBundle(bundleBytes);
    return await this.engine.loadModel(bundle, runtime);
  }
  async loadModelFromFile(filePath, runtime) {
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
        runtime: runtime || "pyodide",
        inputs: [{
          name: "data",
          type: "object",
          dtype: "float32",
          shape: [1],
          description: "Input data for prediction"
        }],
        outputs: [{
          name: "result",
          type: "object",
          dtype: "float32",
          shape: [1],
          description: "Prediction result"
        }],
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
    return await this.engine.loadModel(bundle, runtime);
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
  BaseAdapter,
  ONNXAdapter,
  PyodideAdapter,
  PythonEngine,
  PythonReactML,
  RuntimeAdapterFactory,
  TFJSAdapter,
  createPythonML,
  extractBundle,
  fetchBundle,
  loadPythonFile
});
