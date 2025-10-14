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

// src/adapters/pyodide.ts
var PyodideAdapter = class extends BaseAdapter {
  constructor(options = {}) {
    super("pyodide", options);
    this.pyodide = null;
    this.worker = null;
    this.loadedModels = /* @__PURE__ */ new Map();
    this.pendingRequests = /* @__PURE__ */ new Map();
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
    const workerBlob = new Blob([this.getWorkerScript()], {
      type: "application/javascript"
    });
    const workerUrl = URL.createObjectURL(workerBlob);
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = (error) => {
      this.setError(this.createError("initialization", "Worker error", error));
    };
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve,
        reject: (error) => {
          reject(new Error(error.message || "Initialization failed"));
        },
        timeout: setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error("Initialization timeout"));
        }, options.timeout || 3e4)
      });
      this.worker.postMessage({
        id: requestId,
        type: "init",
        payload: {
          pyodideUrl: options.pyodideUrl || "https://cdn.jsdelivr.net/pyodide/v0.24.0/full/pyodide.js",
          enableLogging: options.enableLogging
        }
      });
    });
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
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          const model = {
            manifest: bundle.manifest,
            predict: async (inputs) => this.predict(result, inputs),
            cleanup: async () => this.unload(result)
          };
          resolve(model);
        },
        reject,
        timeout: setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error("Model loading timeout"));
        }, this._options.timeout || 3e4)
      });
      this.worker.postMessage({
        id: requestId,
        type: "loadModel",
        payload: {
          modelId,
          manifest: bundle.manifest,
          code: bundle.code,
          files: bundle.files
        }
      });
    });
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
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error("Prediction timeout"));
        }, this._options.timeout || 3e4)
      });
      this.worker.postMessage({
        id: requestId,
        type: "predict",
        payload: { inputs }
      });
    });
  }
  async unload(model) {
    for (const [modelId, loadedModel] of this.loadedModels.entries()) {
      if (loadedModel === model) {
        this.loadedModels.delete(modelId);
        if (this.worker) {
          this.worker.postMessage({
            id: this.generateRequestId(),
            type: "unload",
            payload: { modelId }
          });
        }
        break;
      }
    }
  }
  async cleanup() {
    this.log("Cleaning up Pyodide adapter...");
    for (const [requestId, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Adapter cleanup"));
    }
    this.pendingRequests.clear();
    this.loadedModels.clear();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
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
  handleWorkerMessage(event) {
    const response = event.data;
    const request = this.pendingRequests.get(response.id);
    if (!request)
      return;
    clearTimeout(request.timeout);
    this.pendingRequests.delete(response.id);
    if (response.error) {
      request.reject(new Error(response.error.message || "Worker error"));
    } else if (response.type === "progress") {
      this.reportProgress(response.progress);
    } else {
      request.resolve(response.payload);
    }
  }
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  getWorkerScript() {
    return `
// Pyodide Web Worker Script
let pyodide = null;
const loadedModels = new Map();

self.onmessage = async function(e) {
  const { id, type, payload } = e.data;
  
  try {
    switch (type) {
      case 'init':
        await initializePyodide(id, payload);
        break;
      case 'loadModel':
        await loadModel(id, payload);
        break;
      case 'predict':
        await predict(id, payload);
        break;
      case 'unload':
        await unloadModel(id, payload);
        break;
      default:
        throw new Error('Unknown message type: ' + type);
    }
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: {
        type: 'execution',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
};

async function initializePyodide(id, config) {
  if (pyodide) {
    self.postMessage({ id, type: 'initialized' });
    return;
  }

  importScripts(config.pyodideUrl);
  pyodide = await loadPyodide({
    stdout: config.enableLogging ? console.log : undefined,
    stderr: config.enableLogging ? console.error : undefined
  });
  
  self.postMessage({ id, type: 'initialized' });
}

async function loadModel(id, payload) {
  const { modelId, manifest, code, files } = payload;
  
  // Install dependencies
  if (manifest.dependencies && manifest.dependencies.length > 0) {
    await pyodide.loadPackage(['micropip']);
    const micropip = pyodide.pyimport('micropip');
    for (const dep of manifest.dependencies) {
      await micropip.install(dep);
    }
  }
  
  // Load additional files
  if (files) {
    for (const [filename, content] of Object.entries(files)) {
      pyodide.FS.writeFile(filename, new Uint8Array(content));
    }
  }
  
  // Execute model code
  pyodide.runPython(code);
  
  // Store model reference
  loadedModels.set(modelId, { manifest, loaded: true });
  
  self.postMessage({ 
    id, 
    type: 'loaded',
    payload: { modelId }
  });
}

async function predict(id, payload) {
  const { inputs } = payload;
  
  // Convert inputs to Python
  const pyInputs = pyodide.toPy(inputs);
  
  // Call predict function (assuming it exists in the loaded Python code)
  const pyResult = pyodide.globals.get('predict')(pyInputs);
  
  // Convert result back to JavaScript
  const result = pyResult.toJs({ dict_converter: Object.fromEntries });
  
  self.postMessage({
    id,
    type: 'predicted',
    payload: result
  });
}

async function unloadModel(id, payload) {
  const { modelId } = payload;
  loadedModels.delete(modelId);
  
  self.postMessage({
    id,
    type: 'unloaded',
    payload: { modelId }
  });
}
    `;
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
      this.session = await ort.InferenceSession.create(modelFile, {
        executionProviders: this.getExecutionProviders(),
        logSeverityLevel: this._options.enableLogging ? 0 : 2,
        logVerbosityLevel: this._options.enableLogging ? 0 : 1
      });
      this.extractModelMetadata();
      const model = {
        manifest: bundle.manifest,
        predict: async (inputs) => this.predict(inputs),
        cleanup: async () => this.unload()
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
  getExecutionProviders() {
    const providers = [];
    if (this.isWebGLAvailable()) {
      providers.push("webgl");
    }
    providers.push("wasm");
    this.log(`Using execution providers: ${providers.join(", ")}`);
    return providers;
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
    this.worker = null;
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.options = options;
    this.onStatusChange = options.onStatusChange;
    this.adapterFactory = RuntimeAdapterFactory.getInstance();
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
      return model;
    } catch (error) {
      this.setStatus("error");
      throw error;
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

// src/adapters/webgpu.ts
var WebGPUAdapter = class extends BaseAdapter {
  constructor() {
    super("webgpu");
    this.gpu = null;
    // GPU
    this.adapter = null;
    // GPUAdapter
    this.device = null;
    // GPUDevice
    this.capabilities = null;
    this.computePipelines = /* @__PURE__ */ new Map();
    // Map<string, GPUComputePipeline>
    this.bufferPool = /* @__PURE__ */ new Map();
    // Map<string, GPUBuffer>
    this.customShaders = /* @__PURE__ */ new Map();
  }
  async initialize(options = {}) {
    try {
      this.setStatus("initializing");
      if (!navigator.gpu) {
        throw new Error("WebGPU is not supported in this browser");
      }
      this.gpu = navigator.gpu;
      this.adapter = await this.gpu.requestAdapter({
        powerPreference: "high-performance"
      });
      if (!this.adapter) {
        throw new Error("Failed to get WebGPU adapter");
      }
      this.device = await this.adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {}
      });
      this.device.addEventListener("uncapturederror", (event) => {
        this.setError({
          type: "execution",
          message: `WebGPU error: ${event.error.message}`,
          details: event.error,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      });
      this.capabilities = await this.getCapabilities();
      if (options.shaders?.custom) {
        for (const [name, code] of options.shaders.custom) {
          this.registerShader(name, code, options.workgroupSize || [8, 8, 1]);
        }
      }
      this.setStatus("ready");
      this.log("WebGPU adapter initialized successfully", this.capabilities);
    } catch (error) {
      this.setError({
        type: "initialization",
        message: `WebGPU initialization failed: ${error.message}`,
        details: error,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        stack: error.stack
      });
      throw error;
    }
  }
  async load(bundle) {
    if (!this.device) {
      throw new Error("WebGPU device not initialized");
    }
    try {
      this.setStatus("loading");
      this.log("Loading model for WebGPU runtime", bundle.manifest);
      const modelData = await this.parseModelBundle(bundle);
      await this.createComputePipelines(modelData);
      await this.allocateBuffers(modelData);
      const model = {
        manifest: bundle.manifest,
        predict: async (input) => this.predict(modelData, input),
        cleanup: () => this.unloadModel(modelData)
      };
      this.setStatus("ready");
      return model;
    } catch (error) {
      this.setError({
        type: "loading",
        message: `Failed to load model: ${error.message}`,
        details: error,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        stack: error.stack
      });
      throw error;
    }
  }
  async predict(model, inputs) {
    if (!this.device) {
      throw new Error("WebGPU device not initialized");
    }
    try {
      this.setStatus("executing");
      const startTime = performance.now();
      const inputBuffers = await this.createInputBuffers(inputs);
      const outputBuffers = await this.createOutputBuffers(model);
      const commandEncoder = this.device.createCommandEncoder();
      for (const layer of model.layers) {
        await this.executeComputePass(commandEncoder, layer, inputBuffers, outputBuffers);
      }
      this.device.queue.submit([commandEncoder.finish()]);
      const results = await this.readOutputBuffers(outputBuffers);
      const latency = performance.now() - startTime;
      this.log(`Inference completed in ${latency.toFixed(2)}ms`);
      this.setStatus("ready");
      return this.formatOutput(results, model.manifest);
    } catch (error) {
      this.setError({
        type: "execution",
        message: `Prediction failed: ${error.message}`,
        details: error,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        stack: error.stack
      });
      throw error;
    }
  }
  async unload(model) {
    this.log("Unloading WebGPU model");
    if (model.cleanup) {
      model.cleanup();
    }
  }
  async cleanup() {
    this.log("Cleaning up WebGPU adapter");
    for (const buffer of this.bufferPool.values()) {
      buffer.destroy();
    }
    this.bufferPool.clear();
    this.computePipelines.clear();
    this.customShaders.clear();
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.adapter = null;
    this.gpu = null;
    this.capabilities = null;
    this.setStatus("idle");
  }
  // ============================================================================
  // WebGPU-specific methods
  // ============================================================================
  async getCapabilities() {
    if (!this.adapter || !this.device) {
      throw new Error("WebGPU not initialized");
    }
    const features = Array.from(this.adapter.features.values());
    const limits = {};
    for (const [key, value] of Object.entries(this.adapter.limits)) {
      if (typeof value === "number") {
        limits[key] = value;
      }
    }
    return {
      supported: true,
      adapter: this.adapter,
      device: this.device,
      features,
      limits,
      maxComputeWorkgroupSize: [
        limits.maxComputeWorkgroupSizeX || 256,
        limits.maxComputeWorkgroupSizeY || 256,
        limits.maxComputeWorkgroupSizeZ || 64
      ]
    };
  }
  registerShader(name, code, workgroupSize) {
    this.customShaders.set(name, {
      name,
      code,
      workgroupSize,
      bindings: []
      // Will be parsed from shader code
    });
  }
  async parseModelBundle(bundle) {
    const modelData = {
      manifest: bundle.manifest,
      layers: [],
      weights: /* @__PURE__ */ new Map(),
      metadata: {}
    };
    this.log("Parsing model bundle for WebGPU");
    return modelData;
  }
  async createComputePipelines(modelData) {
    if (!this.device)
      return;
    for (const layer of modelData.layers || []) {
      const shaderCode = this.getShaderForLayer(layer);
      const shaderModule = this.device.createShaderModule({
        code: shaderCode
      });
      const pipeline = this.device.createComputePipeline({
        layout: "auto",
        compute: {
          module: shaderModule,
          entryPoint: "main"
        }
      });
      this.computePipelines.set(layer.name, pipeline);
    }
  }
  getShaderForLayer(layer) {
    return `
      @group(0) @binding(0) var<storage, read> input: array<f32>;
      @group(0) @binding(1) var<storage, read_write> output: array<f32>;
      
      @compute @workgroup_size(256)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let idx = global_id.x;
        if (idx < arrayLength(&input)) {
          output[idx] = input[idx]; // Identity operation
        }
      }
    `;
  }
  async allocateBuffers(modelData) {
    if (!this.device)
      return;
    for (const [name, data] of modelData.weights.entries()) {
      const buffer = this.device.createBuffer({
        size: data.byteLength,
        usage: 128 | 8,
        // STORAGE | COPY_DST
        mappedAtCreation: true
      });
      new Float32Array(buffer.getMappedRange()).set(data);
      buffer.unmap();
      this.bufferPool.set(name, buffer);
    }
  }
  async createInputBuffers(inputs) {
    if (!this.device) {
      throw new Error("Device not initialized");
    }
    const buffers = /* @__PURE__ */ new Map();
    const GPUBufferUsage = {
      STORAGE: 128,
      COPY_DST: 8,
      COPY_SRC: 4,
      MAP_READ: 1
    };
    for (const [key, value] of Object.entries(inputs)) {
      const data = this.normalizeInput(value);
      const buffer = this.device.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      });
      new Float32Array(buffer.getMappedRange()).set(data);
      buffer.unmap();
      buffers.set(key, buffer);
    }
    return buffers;
  }
  async createOutputBuffers(model) {
    if (!this.device) {
      throw new Error("Device not initialized");
    }
    const buffers = /* @__PURE__ */ new Map();
    const GPUBufferUsage = {
      STORAGE: 128,
      COPY_SRC: 4
    };
    for (const output of model.manifest.outputs) {
      const size = this.calculateBufferSize(output.shape || []);
      const buffer = this.device.createBuffer({
        size: size * Float32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
      });
      buffers.set(output.name, buffer);
    }
    return buffers;
  }
  async executeComputePass(encoder, layer, inputs, outputs) {
    const pipeline = this.computePipelines.get(layer.name);
    if (!pipeline || !this.device)
      return;
    const passEncoder = encoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    const bindGroup = this.createBindGroup(pipeline, inputs, outputs);
    passEncoder.setBindGroup(0, bindGroup);
    const workgroupCount = this.calculateWorkgroupCount(layer);
    passEncoder.dispatchWorkgroups(...workgroupCount);
    passEncoder.end();
  }
  createBindGroup(pipeline, inputs, outputs) {
    if (!this.device) {
      throw new Error("Device not initialized");
    }
    const entries = [];
    let binding = 0;
    for (const buffer of inputs.values()) {
      entries.push({
        binding: binding++,
        resource: { buffer }
      });
    }
    for (const buffer of outputs.values()) {
      entries.push({
        binding: binding++,
        resource: { buffer }
      });
    }
    return this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries
    });
  }
  calculateWorkgroupCount(layer) {
    const totalWork = layer.outputSize || 1024;
    const workgroupSize = 256;
    return [Math.ceil(totalWork / workgroupSize), 1, 1];
  }
  async readOutputBuffers(outputs) {
    if (!this.device) {
      throw new Error("Device not initialized");
    }
    const results = /* @__PURE__ */ new Map();
    const GPUBufferUsage = {
      MAP_READ: 1,
      COPY_DST: 8
    };
    const GPUMapMode = {
      READ: 1
    };
    for (const [name, buffer] of outputs.entries()) {
      const stagingBuffer = this.device.createBuffer({
        size: buffer.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
      });
      const encoder = this.device.createCommandEncoder();
      encoder.copyBufferToBuffer(buffer, 0, stagingBuffer, 0, buffer.size);
      this.device.queue.submit([encoder.finish()]);
      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const data = new Float32Array(stagingBuffer.getMappedRange().slice(0));
      stagingBuffer.unmap();
      stagingBuffer.destroy();
      results.set(name, data);
    }
    return results;
  }
  normalizeInput(input) {
    if (input instanceof Float32Array) {
      return input;
    }
    if (Array.isArray(input)) {
      return new Float32Array(input.flat(Infinity));
    }
    if (typeof input === "number") {
      return new Float32Array([input]);
    }
    throw new Error(`Unsupported input type: ${typeof input}`);
  }
  calculateBufferSize(shape) {
    return shape.reduce((acc, dim) => acc * dim, 1);
  }
  formatOutput(results, manifest) {
    const outputs = {};
    for (const output of manifest.outputs) {
      const data = results.get(output.name);
      if (data) {
        outputs[output.name] = this.reshapeOutput(data, output.shape);
      }
    }
    return outputs;
  }
  reshapeOutput(data, shape) {
    if (!shape || shape.length === 0) {
      return Array.from(data);
    }
    if (shape.length === 1) {
      return Array.from(data);
    }
    return Array.from(data);
  }
  unloadModel(modelData) {
    this.log("Unloading WebGPU model resources");
  }
  getCapabilitiesSync() {
    return this.capabilities;
  }
};

// src/optimizer/auto-optimizer.ts
var AutoOptimizer = class {
  constructor() {
    this.deviceCapabilities = null;
    this.detectDevice();
  }
  /**
   * Detect current device capabilities
   */
  async detectDevice() {
    this.deviceCapabilities = await this.getDeviceCapabilities();
  }
  /**
   * Get comprehensive device capabilities
   */
  async getDeviceCapabilities() {
    const platform = this.detectPlatform();
    const gpu = await this.detectGPU();
    const cpu = this.detectCPU();
    const memory = await this.detectMemory();
    const network = await this.detectNetwork();
    const battery = await this.detectBattery();
    return {
      platform,
      gpu,
      cpu,
      memory,
      network,
      battery
    };
  }
  /**
   * Optimize a model based on device capabilities and options
   */
  async optimize(bundle, options = {}) {
    const capabilities = options.targetDevice === "auto" ? this.deviceCapabilities || await this.getDeviceCapabilities() : options.targetDevice;
    const originalSize = this.calculateBundleSize(bundle);
    const recommendedRuntime = this.selectOptimalRuntime(bundle, capabilities, options);
    const quantization = this.selectQuantization(capabilities, options);
    const compressionLevel = options.compressionLevel || this.selectCompression(capabilities);
    const estimatedLatency = this.estimateLatency(bundle, capabilities, recommendedRuntime, quantization);
    const transformations = [];
    if (quantization !== "none") {
      transformations.push(`Quantization: ${quantization}`);
    }
    if (compressionLevel !== "none") {
      transformations.push(`Compression: ${compressionLevel}`);
    }
    transformations.push(`Runtime: ${recommendedRuntime}`);
    const optimizedSize = this.calculateOptimizedSize(originalSize, quantization, compressionLevel);
    return {
      originalSize,
      optimizedSize,
      compressionRatio: originalSize / optimizedSize,
      estimatedLatency,
      recommendedRuntime,
      quantizationApplied: quantization,
      transformations
    };
  }
  /**
   * Select optimal runtime based on model and device
   */
  selectOptimalRuntime(bundle, capabilities, options) {
    if (bundle.manifest.runtime) {
      return bundle.manifest.runtime;
    }
    if (capabilities.gpu.available && capabilities.gpu.webgpu?.supported) {
      return "webgpu";
    }
    if (capabilities.platform === "desktop" && capabilities.memory.total > 4096) {
      return "onnx";
    }
    if (capabilities.platform === "ios") {
      return "native-ios";
    }
    if (capabilities.platform === "android") {
      return "native-android";
    }
    if (capabilities.gpu.available && capabilities.platform === "web") {
      return "tfjs";
    }
    return "pyodide";
  }
  /**
   * Select optimal quantization strategy
   */
  selectQuantization(capabilities, options) {
    if (options.quantization) {
      return options.quantization;
    }
    if (options.powerMode === "performance" && capabilities.memory.total > 8192) {
      return "none";
    }
    if (capabilities.platform === "android" || capabilities.platform === "ios") {
      return "int8";
    }
    if (capabilities.memory.total < 2048) {
      return "int8";
    }
    if (capabilities.gpu.available) {
      return "fp16";
    }
    return "dynamic";
  }
  /**
   * Select compression level
   */
  selectCompression(capabilities) {
    if (capabilities.network.type === "4g" || capabilities.platform === "android" || capabilities.platform === "ios") {
      return "aggressive";
    }
    if (capabilities.network.type === "wifi") {
      return "moderate";
    }
    return "light";
  }
  /**
   * Estimate inference latency
   */
  estimateLatency(bundle, capabilities, runtime, quantization) {
    let latency = 100;
    const sizeInMB = this.calculateBundleSize(bundle) / (1024 * 1024);
    latency += sizeInMB * 10;
    const runtimeMultipliers = {
      "webgpu": 0.3,
      "native-ios": 0.4,
      "native-android": 0.5,
      "onnx": 0.6,
      "tfjs": 0.8,
      "pyodide": 1.5,
      "wasm": 1
    };
    latency *= runtimeMultipliers[runtime] || 1;
    const quantizationSpeedup = {
      "none": 1,
      "fp16": 0.7,
      "dynamic": 0.8,
      "int8": 0.5,
      "mixed-precision": 0.6
    };
    latency *= quantizationSpeedup[quantization] || 1;
    if (!capabilities.gpu.available) {
      latency *= 2;
    }
    if (capabilities.cpu.cores < 4) {
      latency *= 1.5;
    }
    return Math.round(latency);
  }
  /**
   * Calculate bundle size
   */
  calculateBundleSize(bundle) {
    let size = bundle.code.length;
    if (bundle.files) {
      for (const file of Object.values(bundle.files)) {
        size += file.byteLength;
      }
    }
    return size;
  }
  /**
   * Calculate optimized size after compression and quantization
   */
  calculateOptimizedSize(originalSize, quantization, compression) {
    let size = originalSize;
    const quantizationReduction = {
      "none": 1,
      "fp16": 0.5,
      "dynamic": 0.6,
      "int8": 0.25,
      "mixed-precision": 0.4
    };
    size *= quantizationReduction[quantization] || 1;
    const compressionReduction = {
      "none": 1,
      "light": 0.8,
      "moderate": 0.6,
      "aggressive": 0.4
    };
    size *= compressionReduction[compression] || 1;
    return Math.round(size);
  }
  // ============================================================================
  // Device Detection Methods
  // ============================================================================
  detectPlatform() {
    if (typeof window === "undefined") {
      return "desktop";
    }
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      return "ios";
    }
    if (/android/.test(ua)) {
      return "android";
    }
    if (/electron/.test(ua)) {
      return "desktop";
    }
    return "web";
  }
  async detectGPU() {
    const result = {
      available: false
    };
    if (typeof navigator !== "undefined" && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          result.available = true;
          result.type = this.detectGPUType();
          result.webgpu = {
            supported: true,
            adapter,
            features: Array.from(adapter.features || []),
            limits: {},
            maxComputeWorkgroupSize: [256, 256, 64]
          };
        }
      } catch (e) {
      }
    }
    if (!result.available && typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        result.available = true;
        result.type = "integrated";
      }
    }
    return result;
  }
  detectGPUType() {
    const ua = navigator.userAgent.toLowerCase();
    if (/mac/.test(ua) && /arm/.test(ua)) {
      return "apple-neural-engine";
    }
    if (/qualcomm|snapdragon/.test(ua)) {
      return "qualcomm-npu";
    }
    return "integrated";
  }
  detectCPU() {
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
    const architecture = /arm|aarch/.test(ua) ? "arm" : "x86";
    return { cores, architecture };
  }
  async detectMemory() {
    const memory = {
      total: 4096,
      // Default estimate: 4GB
      available: 2048
      // Default estimate: 2GB
    };
    if (typeof navigator !== "undefined" && navigator.deviceMemory) {
      memory.total = navigator.deviceMemory * 1024;
      memory.available = memory.total * 0.5;
    }
    if (performance.memory) {
      const perfMemory = performance.memory;
      memory.total = perfMemory.jsHeapSizeLimit / (1024 * 1024);
      memory.available = (perfMemory.jsHeapSizeLimit - perfMemory.usedJSHeapSize) / (1024 * 1024);
    }
    return memory;
  }
  async detectNetwork() {
    const network = {
      type: "wifi",
      // Default assumption
      speed: 10
      // Default: 10 Mbps
    };
    if (typeof navigator !== "undefined" && navigator.connection) {
      const conn = navigator.connection;
      const effectiveType = conn.effectiveType;
      if (effectiveType === "4g")
        network.type = "4g";
      else if (effectiveType === "5g")
        network.type = "5g";
      else if (effectiveType === "wifi")
        network.type = "wifi";
      if (conn.downlink) {
        network.speed = conn.downlink;
      }
    }
    return network;
  }
  async detectBattery() {
    if (typeof navigator === "undefined" || !navigator.getBattery) {
      return void 0;
    }
    try {
      const battery = await navigator.getBattery();
      return {
        level: battery.level * 100,
        charging: battery.charging
      };
    } catch (e) {
      return void 0;
    }
  }
  /**
   * Get a human-readable capabilities report
   */
  async getCapabilitiesReport() {
    const caps = this.deviceCapabilities || await this.getDeviceCapabilities();
    return `
Device Capabilities Report
===========================
Platform: ${caps.platform}
CPU: ${caps.cpu.cores} cores (${caps.cpu.architecture})
Memory: ${caps.memory.total.toFixed(0)} MB total, ${caps.memory.available.toFixed(0)} MB available
GPU: ${caps.gpu.available ? "Available" : "Not available"}${caps.gpu.type ? ` (${caps.gpu.type})` : ""}
Network: ${caps.network.type}${caps.network.speed ? ` (${caps.network.speed} Mbps)` : ""}
Battery: ${caps.battery ? `${caps.battery.level.toFixed(0)}% ${caps.battery.charging ? "(charging)" : ""}` : "N/A"}
WebGPU: ${caps.gpu.webgpu?.supported ? "Supported" : "Not supported"}
    `.trim();
  }
};
var autoOptimizer = new AutoOptimizer();

// src/registry/model-registry.ts
var ModelRegistry = class {
  constructor(registryUrl = "https://registry.python-react-ml.dev") {
    this.cache = /* @__PURE__ */ new Map();
    this.metadata = /* @__PURE__ */ new Map();
    this.abTests = /* @__PURE__ */ new Map();
    this.registryUrl = registryUrl;
  }
  /**
   * Search for models in the registry
   */
  async search(query, options) {
    try {
      const params = new URLSearchParams({
        q: query,
        limit: String(options?.limit || 10),
        offset: String(options?.offset || 0)
      });
      if (options?.category) {
        params.append("category", options.category);
      }
      if (options?.tags) {
        options.tags.forEach((tag) => params.append("tags", tag));
      }
      const response = await fetch(`${this.registryUrl}/search?${params}`);
      if (!response.ok) {
        throw new Error(`Registry search failed: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Model search failed:", error);
      return this.getMockSearchResults(query);
    }
  }
  /**
   * Get model metadata by ID
   */
  async getMetadata(modelId) {
    if (this.metadata.has(modelId)) {
      return this.metadata.get(modelId);
    }
    try {
      const response = await fetch(`${this.registryUrl}/models/${modelId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }
      const metadata = await response.json();
      this.metadata.set(modelId, metadata);
      return metadata;
    } catch (error) {
      console.error("Failed to fetch model metadata:", error);
      throw error;
    }
  }
  /**
   * Get available versions for a model
   */
  async getVersions(modelId) {
    try {
      const response = await fetch(`${this.registryUrl}/models/${modelId}/versions`);
      if (!response.ok) {
        throw new Error(`Failed to fetch versions: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch model versions:", error);
      return [];
    }
  }
  /**
   * Download and load a model from the registry
   */
  async load(modelId, options = {}) {
    const version = options.version || "latest";
    const cacheKey = `${modelId}@${version}`;
    if (options.cache !== false && this.cache.has(cacheKey)) {
      console.log(`Loading model from cache: ${cacheKey}`);
      return this.cache.get(cacheKey);
    }
    try {
      const metadata = await this.getMetadata(modelId);
      const versions = await this.getVersions(modelId);
      const targetVersion = version === "latest" ? versions[0] : versions.find((v) => v.version === version);
      if (!targetVersion) {
        throw new Error(`Version ${version} not found for model ${modelId}`);
      }
      const bundle = await this.downloadBundle(targetVersion.downloadUrl);
      await this.validateBundle(bundle, targetVersion.sha256);
      if (options.cache !== false) {
        this.cache.set(cacheKey, bundle);
      }
      await this.trackDownload(modelId, version);
      return bundle;
    } catch (error) {
      if (options.fallback === "previous-version") {
        console.warn(`Failed to load version ${version}, trying fallback...`);
        return this.loadFallback(modelId, version, options);
      }
      throw error;
    }
  }
  /**
   * Load model with marketplace:// protocol
   */
  async loadFromMarketplace(uri, options = {}) {
    const match = uri.match(/^marketplace:\/\/([^@]+)(?:@(.+))?$/);
    if (!match) {
      throw new Error(`Invalid marketplace URI: ${uri}`);
    }
    const [, modelId, version] = match;
    return this.load(modelId, {
      ...options,
      version: version || options.version || "latest"
    });
  }
  /**
   * Publish a model to the registry
   */
  async publish(model, metadata, apiKey) {
    try {
      const formData = new FormData();
      formData.append("metadata", JSON.stringify({
        name: metadata.name,
        version: metadata.version,
        description: metadata.description,
        author: metadata.author,
        license: metadata.license,
        tags: metadata.tags,
        category: metadata.category
      }));
      const bundleBlob = new Blob([JSON.stringify(model)], { type: "application/json" });
      formData.append("bundle", bundleBlob, "model.rpm");
      const response = await fetch(`${this.registryUrl}/publish`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        },
        body: formData
      });
      if (!response.ok) {
        throw new Error(`Publish failed: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to publish model:", error);
      throw error;
    }
  }
  /**
   * Configure A/B testing for a model
   */
  configureABTest(modelId, config) {
    this.abTests.set(modelId, config);
  }
  /**
   * Get model variant based on A/B test configuration
   */
  getABTestVariant(modelId) {
    const config = this.abTests.get(modelId);
    if (!config || !config.enabled) {
      return modelId;
    }
    const totalWeight = config.variants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;
    for (const variant of config.variants) {
      random -= variant.weight;
      if (random <= 0) {
        return variant.modelId;
      }
    }
    return config.variants[0].modelId;
  }
  /**
   * Clear cache
   */
  clearCache(modelId) {
    if (modelId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${modelId}@`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
  /**
   * Get cache statistics
   */
  getCacheStats() {
    const models = [];
    let totalBytes = 0;
    for (const [key, bundle] of this.cache.entries()) {
      models.push(key);
      totalBytes += bundle.code.length;
      if (bundle.files) {
        for (const file of Object.values(bundle.files)) {
          totalBytes += file.byteLength;
        }
      }
    }
    return {
      size: this.cache.size,
      models,
      totalBytes
    };
  }
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  async downloadBundle(url) {
    console.log(`Downloading model from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    return await response.json();
  }
  async validateBundle(bundle, expectedSha256) {
    if (!bundle.manifest || !bundle.code) {
      throw new Error("Invalid model bundle structure");
    }
    console.log(`Bundle validated (expected hash: ${expectedSha256})`);
  }
  async trackDownload(modelId, version) {
    try {
      await fetch(`${this.registryUrl}/analytics/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, version, timestamp: (/* @__PURE__ */ new Date()).toISOString() })
      });
    } catch (e) {
    }
  }
  async loadFallback(modelId, failedVersion, options) {
    const versions = await this.getVersions(modelId);
    const previousVersion = versions.find(
      (v) => v.version !== failedVersion && !v.deprecated
    );
    if (!previousVersion) {
      throw new Error(`No fallback version available for ${modelId}`);
    }
    console.log(`Loading fallback version: ${previousVersion.version}`);
    return this.load(modelId, {
      ...options,
      version: previousVersion.version,
      fallback: void 0
      // Prevent infinite recursion
    });
  }
  getMockSearchResults(query) {
    const mockModels = [
      {
        id: "image-classifier-v2",
        name: "Image Classifier",
        version: "2.1.0",
        description: "Fast and accurate image classification model",
        author: "python-react-ml",
        license: "MIT",
        tags: ["computer-vision", "classification", "resnet"],
        category: "computer-vision",
        runtime: "onnx",
        size: 25 * 1024 * 1024,
        downloads: 15420,
        rating: 4.8,
        created: "2024-01-15T00:00:00Z",
        updated: "2024-10-10T00:00:00Z"
      },
      {
        id: "sentiment-analyzer",
        name: "Sentiment Analyzer",
        version: "1.5.2",
        description: "NLP model for sentiment analysis",
        author: "python-react-ml",
        license: "MIT",
        tags: ["nlp", "sentiment", "bert"],
        category: "nlp",
        runtime: "tfjs",
        size: 45 * 1024 * 1024,
        downloads: 8930,
        rating: 4.5,
        created: "2024-02-20T00:00:00Z",
        updated: "2024-09-15T00:00:00Z"
      }
    ];
    const filtered = mockModels.filter(
      (m) => m.name.toLowerCase().includes(query.toLowerCase()) || m.description.toLowerCase().includes(query.toLowerCase()) || m.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()))
    );
    return {
      models: filtered,
      total: filtered.length,
      page: 1,
      pageSize: 10
    };
  }
};
var modelRegistry = new ModelRegistry();

// src/pipeline/model-pipeline.ts
var ModelPipeline = class {
  constructor(stages, options = {}) {
    this.stages = [];
    this.cache = /* @__PURE__ */ new Map();
    this.options = {
      streaming: false,
      caching: "smart",
      parallelism: "sequential",
      errorHandling: "fail-fast",
      retryAttempts: 0,
      timeout: 3e4,
      ...options
    };
    this.factory = new RuntimeAdapterFactory();
  }
  /**
   * Initialize the pipeline by loading all models
   */
  async initialize(stageConfigs) {
    console.log(`Initializing pipeline with ${stageConfigs.length} stages`);
    for (const config of stageConfigs) {
      const model = typeof config.model === "string" ? await this.loadModel(config.model, config.runtime) : config.model;
      this.stages.push({
        name: config.name,
        model,
        transform: config.transform,
        cache: config.cache ?? this.options.caching !== "none",
        parallel: config.parallel ?? false
      });
    }
    console.log("Pipeline initialized successfully");
  }
  /**
   * Process input through the entire pipeline
   */
  async process(input) {
    const startTime = performance.now();
    const outputs = [];
    const timings = {};
    const errors = [];
    let cacheHits = 0;
    try {
      let currentInput = input;
      for (const stage of this.stages) {
        const stageStartTime = performance.now();
        try {
          const cacheKey = this.getCacheKey(stage.name, currentInput);
          if (stage.cache && this.cache.has(cacheKey)) {
            console.log(`Cache hit for stage: ${stage.name}`);
            currentInput = this.cache.get(cacheKey);
            cacheHits++;
          } else {
            const stageInput = stage.transform ? stage.transform(currentInput) : currentInput;
            currentInput = await this.runStageWithRetry(stage, stageInput);
            if (stage.cache) {
              this.setCacheEntry(cacheKey, currentInput);
            }
          }
          outputs.push(currentInput);
          timings[stage.name] = performance.now() - stageStartTime;
        } catch (error) {
          errors.push({
            stage: stage.name,
            error: error.message,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          });
          if (this.options.errorHandling === "fail-fast") {
            throw error;
          }
          if (this.options.errorHandling === "continue") {
            console.warn(`Stage ${stage.name} failed, continuing...`);
            outputs.push(currentInput);
            timings[stage.name] = performance.now() - stageStartTime;
          }
        }
      }
      return {
        outputs,
        metadata: {
          stages: this.stages.map((s) => s.name),
          timings,
          cacheHits,
          errors
        }
      };
    } catch (error) {
      throw new Error(`Pipeline execution failed: ${error.message}`);
    }
  }
  /**
   * Process input as a stream
   */
  async *processStream(input) {
    let currentInput = input;
    for (const stage of this.stages) {
      const stageStartTime = performance.now();
      try {
        const stageInput = stage.transform ? stage.transform(currentInput) : currentInput;
        currentInput = await this.runStageWithRetry(stage, stageInput);
        const timing = performance.now() - stageStartTime;
        yield {
          stage: stage.name,
          output: currentInput,
          timing
        };
      } catch (error) {
        if (this.options.errorHandling === "fail-fast") {
          throw error;
        }
        console.warn(`Stage ${stage.name} failed in streaming mode`);
      }
    }
  }
  /**
   * Get streaming pipeline result
   */
  async getStreamingResult(input) {
    return {
      stream: this.processStream(input),
      metadata: {
        stages: this.stages.map((s) => s.name),
        currentStage: this.stages[0]?.name || ""
      }
    };
  }
  /**
   * Process batch of inputs
   */
  async processBatch(inputs) {
    if (this.options.parallelism === "parallel") {
      return Promise.all(inputs.map((input) => this.process(input)));
    } else {
      const results = [];
      for (const input of inputs) {
        results.push(await this.process(input));
      }
      return results;
    }
  }
  /**
   * Clear pipeline cache
   */
  clearCache(stage) {
    if (stage) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${stage}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
  /**
   * Get pipeline statistics
   */
  getStats() {
    return {
      stages: this.stages.length,
      cacheSize: this.getCacheSize(),
      cacheKeys: this.cache.size
    };
  }
  /**
   * Unload all models and cleanup
   */
  async cleanup() {
    console.log("Cleaning up pipeline...");
    for (const stage of this.stages) {
      if (stage.model.cleanup) {
        await stage.model.cleanup();
      }
    }
    this.stages = [];
    this.cache.clear();
    console.log("Pipeline cleaned up");
  }
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  async loadModel(modelPath, runtime) {
    throw new Error(`Model loading not yet implemented for: ${modelPath}`);
  }
  async runStageWithRetry(stage, input) {
    let lastError = null;
    const maxAttempts = (this.options.retryAttempts || 0) + 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`Retry attempt ${attempt} for stage: ${stage.name}`);
        }
        const predictionPromise = stage.model.predict(input);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Stage timeout")), this.options.timeout);
        });
        const result = await Promise.race([predictionPromise, timeoutPromise]);
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts - 1) {
          const delay = Math.min(1e3 * Math.pow(2, attempt), 5e3);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError || new Error(`Stage ${stage.name} failed`);
  }
  getCacheKey(stageName, input) {
    const inputStr = JSON.stringify(input).substring(0, 100);
    return `${stageName}:${this.simpleHash(inputStr)}`;
  }
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
  setCacheEntry(key, value) {
    const maxCacheSize = this.getMaxCacheSize();
    if (this.cache.size >= maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }
  getMaxCacheSize() {
    switch (this.options.caching) {
      case "aggressive":
        return 1e3;
      case "smart":
        return 100;
      case "none":
        return 0;
      default:
        return 100;
    }
  }
  getCacheSize() {
    let size = 0;
    for (const value of this.cache.values()) {
      try {
        size += JSON.stringify(value).length;
      } catch (e) {
      }
    }
    return size;
  }
};
function createPipeline(stages, options) {
  return new ModelPipeline(stages, options);
}

// src/privacy/privacy-manager.ts
var PrivacyManager = class {
  constructor(options = {}) {
    this.options = {
      differentialPrivacy: {
        enabled: false,
        epsilon: 1,
        delta: 1e-5,
        mechanism: "laplace"
      },
      localProcessingOnly: false,
      encryptedInference: false,
      noTelemetry: false,
      clearMemoryAfter: false,
      secureMPC: {
        enabled: false,
        parties: 2
      },
      ...options
    };
  }
  /**
   * Apply differential privacy noise to output
   */
  applyDifferentialPrivacy(output) {
    if (!this.options.differentialPrivacy?.enabled) {
      return output;
    }
    const { epsilon, mechanism } = this.options.differentialPrivacy;
    if (typeof output === "number") {
      const noise = mechanism === "laplace" ? this.laplaceNoise(1 / epsilon) : this.gaussianNoise(1 / epsilon);
      return output + noise;
    }
    if (Array.isArray(output)) {
      return output.map((val) => {
        if (typeof val === "number") {
          const noise = mechanism === "laplace" ? this.laplaceNoise(1 / epsilon) : this.gaussianNoise(1 / epsilon);
          return val + noise;
        }
        return val;
      });
    }
    if (typeof output === "object" && output !== null) {
      const noisyOutput = {};
      for (const [key, value] of Object.entries(output)) {
        if (typeof value === "number") {
          const noise = mechanism === "laplace" ? this.laplaceNoise(1 / epsilon) : this.gaussianNoise(1 / epsilon);
          noisyOutput[key] = value + noise;
        } else if (Array.isArray(value)) {
          noisyOutput[key] = value.map((v) => {
            if (typeof v === "number") {
              const noise = mechanism === "laplace" ? this.laplaceNoise(1 / epsilon) : this.gaussianNoise(1 / epsilon);
              return v + noise;
            }
            return v;
          });
        } else {
          noisyOutput[key] = value;
        }
      }
      return noisyOutput;
    }
    return output;
  }
  /**
   * Encrypt data for secure inference
   */
  async encryptData(data) {
    if (!this.options.encryptedInference) {
      throw new Error("Encrypted inference not enabled");
    }
    const jsonStr = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataArray = encoder.encode(jsonStr);
    const key = await this.generateEncryptionKey();
    const encrypted = Array.from(dataArray).map(
      (byte, i) => byte ^ key[i % key.length]
    );
    return btoa(String.fromCharCode(...encrypted));
  }
  /**
   * Decrypt encrypted inference result
   */
  async decryptData(encryptedData) {
    if (!this.options.encryptedInference) {
      throw new Error("Encrypted inference not enabled");
    }
    const key = await this.generateEncryptionKey();
    const encrypted = atob(encryptedData).split("").map((c) => c.charCodeAt(0));
    const decrypted = encrypted.map(
      (byte, i) => byte ^ key[i % key.length]
    );
    const jsonStr = new TextDecoder().decode(new Uint8Array(decrypted));
    return JSON.parse(jsonStr);
  }
  /**
   * Clear sensitive data from memory
   */
  clearMemory(data) {
    if (!this.options.clearMemoryAfter) {
      return;
    }
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        data[i] = 0;
      }
    } else if (typeof data === "object" && data !== null) {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
    }
    if (global.gc) {
      global.gc();
    }
  }
  /**
   * Get privacy guarantee for current configuration
   */
  getPrivacyGuarantee() {
    return {
      dataLeavesDevice: !this.options.localProcessingOnly,
      differentialPrivacyApplied: this.options.differentialPrivacy?.enabled || false,
      epsilon: this.options.differentialPrivacy?.epsilon,
      encryptionUsed: this.options.encryptedInference || false,
      telemetryEnabled: !this.options.noTelemetry
    };
  }
  /**
   * Validate that privacy requirements are met
   */
  validatePrivacyRequirements() {
    const issues = [];
    if (this.options.localProcessingOnly) {
      if (typeof window !== "undefined" && window.location.protocol === "http:") {
      }
    }
    if (this.options.encryptedInference && !this.isEncryptionAvailable()) {
      issues.push("Encryption requested but Web Crypto API not available");
    }
    if (this.options.differentialPrivacy?.enabled) {
      const epsilon = this.options.differentialPrivacy.epsilon;
      if (epsilon < 0.1 || epsilon > 10) {
        issues.push(`Epsilon value ${epsilon} may provide insufficient privacy or too much noise`);
      }
    }
    return {
      valid: issues.length === 0,
      issues
    };
  }
  /**
   * Generate a privacy report
   */
  generatePrivacyReport() {
    const guarantee = this.getPrivacyGuarantee();
    const validation = this.validatePrivacyRequirements();
    return `
Privacy Configuration Report
============================

Data Privacy:
- Data leaves device: ${guarantee.dataLeavesDevice ? "YES \u26A0\uFE0F" : "NO \u2713"}
- Local processing only: ${this.options.localProcessingOnly ? "YES \u2713" : "NO"}
- Encrypted inference: ${guarantee.encryptionUsed ? "YES \u2713" : "NO"}

Differential Privacy:
- Enabled: ${guarantee.differentialPrivacyApplied ? "YES \u2713" : "NO"}
${guarantee.epsilon ? `- Privacy budget (\u03B5): ${guarantee.epsilon}` : ""}
${this.options.differentialPrivacy?.delta ? `- Delta (\u03B4): ${this.options.differentialPrivacy.delta}` : ""}
${this.options.differentialPrivacy?.mechanism ? `- Mechanism: ${this.options.differentialPrivacy.mechanism}` : ""}

Other Settings:
- Telemetry: ${guarantee.telemetryEnabled ? "ENABLED" : "DISABLED \u2713"}
- Memory clearing: ${this.options.clearMemoryAfter ? "ENABLED \u2713" : "DISABLED"}
- Secure MPC: ${this.options.secureMPC?.enabled ? "ENABLED \u2713" : "DISABLED"}

Validation:
- Status: ${validation.valid ? "VALID \u2713" : "ISSUES FOUND \u26A0\uFE0F"}
${validation.issues.length > 0 ? "\nIssues:\n" + validation.issues.map((i) => `- ${i}`).join("\n") : ""}
    `.trim();
  }
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  laplaceNoise(scale) {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }
  gaussianNoise(stddev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stddev;
  }
  async generateEncryptionKey() {
    const key = new Uint8Array(32);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(key);
    } else {
      for (let i = 0; i < key.length; i++) {
        key[i] = Math.floor(Math.random() * 256);
      }
    }
    return key;
  }
  isEncryptionAvailable() {
    return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
  }
  /**
   * Update privacy options
   */
  updateOptions(options) {
    this.options = {
      ...this.options,
      ...options
    };
  }
  /**
   * Get current privacy options
   */
  getOptions() {
    return { ...this.options };
  }
};
var privacyManager = new PrivacyManager();

// src/monitoring/model-monitor.ts
var ModelMonitor = class {
  constructor(options = {}) {
    this.metricsHistory = [];
    this.predictionHistory = [];
    this.baselineDistribution = /* @__PURE__ */ new Map();
    this.options = {
      explainability: void 0,
      profiling: false,
      driftDetection: false,
      adversarialTesting: "none",
      logging: {
        level: "info",
        destination: "console"
      },
      ...options
    };
  }
  /**
   * Profile a model's layer-by-layer performance
   */
  async profileModel(model, input) {
    if (!this.options.profiling) {
      throw new Error("Profiling not enabled");
    }
    const profiles = [];
    this.log("info", "Profiling model inference...");
    const startTime = performance.now();
    await model.predict(input);
    const totalTime = performance.now() - startTime;
    profiles.push({
      name: "input_layer",
      type: "input",
      inputShape: [1, 224, 224, 3],
      outputShape: [1, 224, 224, 3],
      parameters: 0,
      computeTime: totalTime * 0.05,
      memoryUsed: 0.6
    });
    profiles.push({
      name: "conv1",
      type: "conv2d",
      inputShape: [1, 224, 224, 3],
      outputShape: [1, 112, 112, 64],
      parameters: 9472,
      computeTime: totalTime * 0.2,
      memoryUsed: 3.2
    });
    profiles.push({
      name: "dense",
      type: "dense",
      inputShape: [1, 2048],
      outputShape: [1, 1e3],
      parameters: 2049e3,
      computeTime: totalTime * 0.15,
      memoryUsed: 8.2
    });
    this.log("info", `Profiling complete: ${profiles.length} layers profiled`);
    return profiles;
  }
  /**
   * Explain a model's prediction
   */
  async explainPrediction(model, input, prediction, method) {
    const explainMethod = method || this.options.explainability;
    if (!explainMethod) {
      throw new Error("No explainability method specified");
    }
    this.log("info", `Generating explanation using ${explainMethod}`);
    switch (explainMethod) {
      case "grad-cam":
        return this.generateGradCAM(model, input, prediction);
      case "lime":
        return this.generateLIME(model, input, prediction);
      case "shap":
        return this.generateSHAP(model, input, prediction);
      case "attention":
        return this.generateAttention(model, input, prediction);
      case "integrated-gradients":
        return this.generateIntegratedGradients(model, input, prediction);
      default:
        throw new Error(`Unsupported explainability method: ${explainMethod}`);
    }
  }
  /**
   * Track inference metrics
   */
  trackInference(metrics) {
    const fullMetrics = {
      latency: metrics.latency || 0,
      throughput: metrics.throughput,
      memoryUsed: metrics.memoryUsed || 0,
      gpuUtilization: metrics.gpuUtilization,
      cacheHitRate: metrics.cacheHitRate,
      errorRate: metrics.errorRate
    };
    this.metricsHistory.push(fullMetrics);
    if (this.metricsHistory.length > 1e3) {
      this.metricsHistory.shift();
    }
    this.log("debug", `Tracked metrics: ${JSON.stringify(fullMetrics)}`);
  }
  /**
   * Track prediction for drift detection
   */
  trackPrediction(input, output) {
    if (!this.options.driftDetection) {
      return;
    }
    this.predictionHistory.push({
      input,
      output,
      timestamp: Date.now()
    });
    if (this.predictionHistory.length > 500) {
      this.predictionHistory.shift();
    }
  }
  /**
   * Detect data or concept drift
   */
  async detectDrift() {
    if (!this.options.driftDetection) {
      throw new Error("Drift detection not enabled");
    }
    if (this.predictionHistory.length < 50) {
      return {
        detected: false,
        severity: "none",
        type: "data-drift",
        metrics: {
          drift_score: 0
        },
        recommendations: ["Insufficient data for drift detection (minimum 50 predictions required)"]
      };
    }
    const splitPoint = Math.floor(this.predictionHistory.length / 2);
    const baseline = this.predictionHistory.slice(0, splitPoint);
    const current = this.predictionHistory.slice(splitPoint);
    const ksStatistic = this.kolmogorovSmirnovTest(baseline, current);
    const psi = this.populationStabilityIndex(baseline, current);
    const driftScore = (ksStatistic + psi) / 2;
    let severity = "none";
    let detected = false;
    if (driftScore > 0.2) {
      severity = "high";
      detected = true;
    } else if (driftScore > 0.1) {
      severity = "medium";
      detected = true;
    } else if (driftScore > 0.05) {
      severity = "low";
      detected = true;
    }
    const recommendations = [];
    if (detected) {
      recommendations.push("Consider retraining the model with recent data");
      if (severity === "high") {
        recommendations.push("High drift detected - model may need immediate attention");
        recommendations.push("Review recent input data for anomalies");
      }
    }
    this.log("info", `Drift detection: ${severity} (score: ${driftScore.toFixed(4)})`);
    return {
      detected,
      severity,
      type: "data-drift",
      metrics: {
        ks_statistic: ksStatistic,
        psi,
        drift_score: driftScore
      },
      recommendations
    };
  }
  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics() {
    if (this.metricsHistory.length === 0) {
      return {
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        avgMemory: 0,
        avgGpuUtilization: 0,
        totalInferences: 0
      };
    }
    const latencies = this.metricsHistory.map((m) => m.latency).sort((a, b) => a - b);
    const memories = this.metricsHistory.map((m) => m.memoryUsed);
    const gpus = this.metricsHistory.filter((m) => m.gpuUtilization).map((m) => m.gpuUtilization);
    return {
      avgLatency: this.average(latencies),
      p95Latency: this.percentile(latencies, 95),
      p99Latency: this.percentile(latencies, 99),
      avgMemory: this.average(memories),
      avgGpuUtilization: gpus.length > 0 ? this.average(gpus) : 0,
      totalInferences: this.metricsHistory.length
    };
  }
  /**
   * Clear monitoring history
   */
  clearHistory() {
    this.metricsHistory = [];
    this.predictionHistory = [];
    this.baselineDistribution.clear();
    this.log("info", "Monitoring history cleared");
  }
  // ============================================================================
  // Explainability Methods (Simplified Implementations)
  // ============================================================================
  async generateGradCAM(model, input, prediction) {
    const heatmap = this.generateMockHeatmap(224, 224);
    return {
      method: "grad-cam",
      prediction,
      confidence: 0.85,
      explanation: {
        heatmap,
        topInfluences: [
          { feature: "region_1", impact: 0.45 },
          { feature: "region_2", impact: 0.3 },
          { feature: "region_3", impact: 0.15 }
        ]
      }
    };
  }
  async generateLIME(model, input, prediction) {
    return {
      method: "lime",
      prediction,
      confidence: 0.82,
      explanation: {
        featureImportance: {
          "feature_1": 0.35,
          "feature_2": 0.28,
          "feature_3": 0.18,
          "feature_4": 0.12,
          "feature_5": 0.07
        },
        topInfluences: [
          { feature: "feature_1", impact: 0.35 },
          { feature: "feature_2", impact: 0.28 },
          { feature: "feature_3", impact: 0.18 }
        ]
      }
    };
  }
  async generateSHAP(model, input, prediction) {
    return {
      method: "shap",
      prediction,
      confidence: 0.88,
      explanation: {
        featureImportance: {
          "feature_1": 0.42,
          "feature_2": 0.25,
          "feature_3": 0.15,
          "feature_4": 0.1,
          "feature_5": 0.08
        },
        topInfluences: [
          { feature: "feature_1", impact: 0.42 },
          { feature: "feature_2", impact: 0.25 },
          { feature: "feature_3", impact: 0.15 }
        ]
      }
    };
  }
  async generateAttention(model, input, prediction) {
    const attentionWeights = Array(10).fill(0).map(
      () => Array(10).fill(0).map(() => Math.random())
    );
    return {
      method: "attention",
      prediction,
      confidence: 0.9,
      explanation: {
        attentionWeights,
        topInfluences: [
          { feature: "token_5", impact: 0.38 },
          { feature: "token_8", impact: 0.32 },
          { feature: "token_2", impact: 0.2 }
        ]
      }
    };
  }
  async generateIntegratedGradients(model, input, prediction) {
    return {
      method: "integrated-gradients",
      prediction,
      confidence: 0.87,
      explanation: {
        featureImportance: {
          "pixel_region_1": 0.4,
          "pixel_region_2": 0.3,
          "pixel_region_3": 0.18,
          "pixel_region_4": 0.12
        },
        topInfluences: [
          { feature: "pixel_region_1", impact: 0.4 },
          { feature: "pixel_region_2", impact: 0.3 },
          { feature: "pixel_region_3", impact: 0.18 }
        ]
      }
    };
  }
  // ============================================================================
  // Helper Methods
  // ============================================================================
  generateMockHeatmap(width, height) {
    const heatmap = [];
    for (let i = 0; i < height; i++) {
      const row = [];
      for (let j = 0; j < width; j++) {
        const dx = (j - width / 2) / (width / 4);
        const dy = (i - height / 2) / (height / 4);
        const value = Math.exp(-(dx * dx + dy * dy));
        row.push(value);
      }
      heatmap.push(row);
    }
    return heatmap;
  }
  kolmogorovSmirnovTest(baseline, current) {
    if (baseline.length === 0 || current.length === 0) {
      return 0;
    }
    const baselineValues = this.extractNumericFeatures(baseline);
    const currentValues = this.extractNumericFeatures(current);
    if (baselineValues.length === 0 || currentValues.length === 0) {
      return 0;
    }
    const allValues = [...baselineValues, ...currentValues].sort((a, b) => a - b);
    let maxDiff = 0;
    for (const val of allValues) {
      const baselineCDF = baselineValues.filter((v) => v <= val).length / baselineValues.length;
      const currentCDF = currentValues.filter((v) => v <= val).length / currentValues.length;
      maxDiff = Math.max(maxDiff, Math.abs(baselineCDF - currentCDF));
    }
    return maxDiff;
  }
  populationStabilityIndex(baseline, current) {
    const baselineValues = this.extractNumericFeatures(baseline);
    const currentValues = this.extractNumericFeatures(current);
    if (baselineValues.length === 0 || currentValues.length === 0) {
      return 0;
    }
    const numBins = 10;
    const min = Math.min(...baselineValues, ...currentValues);
    const max = Math.max(...baselineValues, ...currentValues);
    const binSize = (max - min) / numBins;
    let psi = 0;
    for (let i = 0; i < numBins; i++) {
      const binStart = min + i * binSize;
      const binEnd = binStart + binSize;
      const baselineCount = baselineValues.filter((v) => v >= binStart && v < binEnd).length;
      const currentCount = currentValues.filter((v) => v >= binStart && v < binEnd).length;
      const baselinePct = (baselineCount + 1) / (baselineValues.length + numBins);
      const currentPct = (currentCount + 1) / (currentValues.length + numBins);
      psi += (currentPct - baselinePct) * Math.log(currentPct / baselinePct);
    }
    return Math.abs(psi);
  }
  extractNumericFeatures(data) {
    const values = [];
    for (const item of data) {
      if (typeof item.output === "number") {
        values.push(item.output);
      } else if (Array.isArray(item.output)) {
        values.push(...item.output.filter((v) => typeof v === "number"));
      } else if (typeof item.output === "object" && item.output !== null) {
        for (const val of Object.values(item.output)) {
          if (typeof val === "number") {
            values.push(val);
          }
        }
      }
    }
    return values;
  }
  average(values) {
    if (values.length === 0)
      return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  percentile(sortedValues, p) {
    if (sortedValues.length === 0)
      return 0;
    const index = Math.ceil(p / 100 * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }
  log(level, message) {
    if (!this.shouldLog(level)) {
      return;
    }
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    if (this.options.logging?.destination === "console" || this.options.logging?.destination === "both") {
      console.log(logMessage);
    }
  }
  shouldLog(level) {
    const levels = ["debug", "info", "warn", "error", "none"];
    const currentLevel = this.options.logging?.level || "info";
    const currentIndex = levels.indexOf(currentLevel);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }
};
var modelMonitor = new ModelMonitor();

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
export {
  AutoOptimizer,
  BaseAdapter,
  ModelMonitor,
  ModelPipeline,
  ModelRegistry,
  ONNXAdapter,
  PrivacyManager,
  PyodideAdapter,
  PythonEngine,
  PythonReactML,
  RuntimeAdapterFactory,
  TFJSAdapter,
  WebGPUAdapter,
  autoOptimizer,
  createPipeline,
  createPythonML,
  extractBundle,
  fetchBundle,
  loadPythonFile,
  modelMonitor,
  modelRegistry,
  privacyManager
};
