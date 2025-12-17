var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  ErrorBoundary: () => ErrorBoundary,
  ModelErrorBoundary: () => ModelErrorBoundary,
  ModelLoader: () => ModelLoader,
  PythonModelProvider: () => PythonModelProvider,
  useModel: () => useModel,
  useModelContext: () => useModelContext,
  usePythonEngine: () => usePythonEngine,
  withErrorBoundary: () => withErrorBoundary,
  withModelErrorBoundary: () => withModelErrorBoundary
});
module.exports = __toCommonJS(src_exports);

// src/hooks/useModel.ts
var import_react = require("react");
var import_python_react_ml = require("python-react-ml");
function useModel(modelUrl, options = {}) {
  const {
    autoLoad = true,
    retryOnError = false,
    maxRetries = 3,
    onError,
    onProgress,
    ...engineOptions
  } = options;
  const [model, setModel] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)("idle");
  const [error, setError] = (0, import_react.useState)(null);
  const [progress, setProgress] = (0, import_react.useState)({ status: "idle" });
  const [isLoading, setIsLoading] = (0, import_react.useState)(false);
  const [isPredicting, setIsPredicting] = (0, import_react.useState)(false);
  const isMounted = (0, import_react.useRef)(true);
  (0, import_react.useEffect)(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const engineRef = (0, import_react.useRef)(null);
  const retryCountRef = (0, import_react.useRef)(0);
  const abortControllerRef = (0, import_react.useRef)(null);
  const engine = (0, import_react.useMemo)(() => {
    const engineConfig = {
      platform: options.platform || "web",
      pyodideUrl: options.pyodideUrl,
      enableLogging: options.enableLogging,
      memoryLimit: options.memoryLimit,
      timeout: options.timeout,
      gpuAcceleration: options.gpuAcceleration,
      onnxOptions: options.onnxOptions,
      tfjsBackend: options.tfjsBackend,
      onStatusChange: (runtimeStatus) => {
        const modelStatusMap = {
          "idle": "idle",
          "initializing": "downloading",
          "ready": "ready",
          "loading": "loading",
          "executing": "ready",
          "error": "error",
          "terminated": "idle"
        };
        const mappedStatus = modelStatusMap[runtimeStatus];
        setStatus(mappedStatus);
        setProgress((prev) => ({ ...prev, status: mappedStatus }));
      },
      onProgress: (progressValue) => {
        const progressData = {
          status,
          progress: progressValue,
          message: `Progress: ${Math.round(progressValue)}%`
        };
        setProgress(progressData);
        options.onProgress?.(progressData);
      },
      onError: (runtimeError) => {
        const modelError = {
          type: runtimeError.type,
          message: runtimeError.message,
          details: runtimeError.details,
          timestamp: runtimeError.timestamp,
          stack: runtimeError.stack,
          pythonTraceback: runtimeError.pythonTraceback
        };
        setError(modelError);
        setStatus("error");
        setProgress((prev) => ({ ...prev, status: "error", error: modelError }));
        onError?.(modelError);
      }
    };
    const newEngine = new import_python_react_ml.PythonReactML(engineConfig);
    engineRef.current = newEngine;
    return newEngine;
  }, [status, options.platform, options.pyodideUrl, options.enableLogging, options.memoryLimit, options.timeout, options.onError, options.onProgress]);
  const loadModel = (0, import_react.useCallback)(async (url) => {
    const targetUrl = url || modelUrl;
    if (!targetUrl)
      return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setStatus("downloading");
    setError(null);
    setProgress({ status: "downloading", progress: 0, message: "Starting download..." });
    const attemptLoad = async (attempt) => {
      try {
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error("Load operation was cancelled");
        }
        setProgress({
          status: "loading",
          progress: 10,
          message: `Loading model... (Attempt ${attempt}/${maxRetries + 1})`
        });
        const loadedModel = await engine.loadModelFromBundle(targetUrl, options.runtime);
        if (abortControllerRef.current?.signal.aborted) {
          loadedModel.cleanup?.();
          throw new Error("Load operation was cancelled");
        }
        setModel(loadedModel);
        setStatus("ready");
        setProgress({ status: "ready", progress: 100, message: "Model ready" });
        retryCountRef.current = 0;
      } catch (err) {
        if (abortControllerRef.current?.signal.aborted) {
          return;
        }
        const modelError = {
          type: "network",
          message: err instanceof Error ? err.message : "Failed to load model",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          details: { attempt, url: targetUrl, error: err }
        };
        if (retryOnError && attempt <= maxRetries) {
          console.warn(`Model load attempt ${attempt} failed, retrying...`, err);
          setTimeout(() => attemptLoad(attempt + 1), Math.pow(2, attempt) * 1e3);
        } else {
          setError(modelError);
          setStatus("error");
          setProgress({ status: "error", error: modelError });
          console.error("Model loading failed after all retries:", err);
        }
      }
    };
    try {
      await attemptLoad(1);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [modelUrl, engine, retryOnError, maxRetries]);
  const predict = (0, import_react.useCallback)(async (input) => {
    if (!model) {
      const error2 = new Error("Model not loaded");
      setError({
        type: "runtime",
        message: error2.message,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      throw error2;
    }
    setIsPredicting(true);
    setStatus("ready");
    try {
      const result = await model.predict(input);
      return result;
    } catch (err) {
      if (!isMounted.current)
        return;
      const modelError = {
        type: "python",
        message: err instanceof Error ? err.message : "Prediction failed",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: { input }
      };
      setError(modelError);
      throw modelError;
    } finally {
      if (isMounted.current) {
        setIsPredicting(false);
      }
    }
  }, [model]);
  const unload = (0, import_react.useCallback)(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (model) {
      try {
        await model.cleanup?.();
      } catch (err) {
        console.warn("Error during model cleanup:", err);
      }
    }
    setModel(null);
    setStatus("idle");
    setError(null);
    setProgress({ status: "idle" });
    setIsLoading(false);
    setIsPredicting(false);
  }, [model]);
  const reload = (0, import_react.useCallback)(async () => {
    await unload();
    await loadModel();
  }, [unload, loadModel]);
  (0, import_react.useEffect)(() => {
    if (modelUrl && autoLoad) {
      loadModel();
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [modelUrl, autoLoad, loadModel]);
  (0, import_react.useEffect)(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      unload();
      engineRef.current?.cleanup();
    };
  }, [unload]);
  return {
    model,
    status,
    error,
    predict,
    unload,
    reload,
    progress,
    // Enhanced state information
    isLoading,
    isPredicting,
    isReady: status === "ready" && !isLoading && !isPredicting,
    hasError: status === "error" || error !== null,
    // Enhanced actions
    load: loadModel,
    clearError: (0, import_react.useCallback)(() => setError(null), [])
  };
}

// src/hooks/usePythonEngine.ts
var import_react2 = require("react");
var import_python_react_ml2 = require("python-react-ml");
function usePythonEngine(options = {}) {
  const [state, setState] = (0, import_react2.useState)({
    engine: null,
    isInitialized: false,
    isLoading: false,
    error: null
  });
  const engineRef = (0, import_react2.useRef)(null);
  const initialize = (0, import_react2.useCallback)(async () => {
    if (engineRef.current)
      return;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const engine = new import_python_react_ml2.PythonReactML({
        platform: "web",
        pyodideUrl: options.pyodideUrl,
        enableLogging: options.enableLogging
      });
      engineRef.current = engine;
      setState((prev) => ({
        ...prev,
        engine,
        isInitialized: true,
        isLoading: false
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to initialize Python engine";
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }));
      console.error("Python engine initialization failed:", err);
    }
  }, [options.pyodideUrl, options.enableLogging]);
  const cleanup = (0, import_react2.useCallback)(async () => {
    if (engineRef.current) {
      await engineRef.current.cleanup();
      engineRef.current = null;
    }
    setState({
      engine: null,
      isInitialized: false,
      isLoading: false,
      error: null
    });
  }, []);
  (0, import_react2.useEffect)(() => {
    initialize();
    return () => {
      cleanup();
    };
  }, [initialize]);
  return {
    ...state,
    initialize,
    cleanup
  };
}

// src/components/PythonModelProvider.tsx
var import_react3 = require("react");
var import_python_react_ml3 = require("python-react-ml");
var import_jsx_runtime = require("react/jsx-runtime");
var ModelContext = (0, import_react3.createContext)(void 0);
function PythonModelProvider({
  children,
  pyodideUrl,
  enableLogging = false
}) {
  const [engine] = (0, import_react3.useState)(() => new import_python_react_ml3.PythonReactML({
    platform: "web",
    pyodideUrl,
    enableLogging
  }));
  const [isInitialized, setIsInitialized] = (0, import_react3.useState)(false);
  const [error, setError] = (0, import_react3.useState)(null);
  const loadModel = async (url) => {
    try {
      setError(null);
      return await engine.loadModelFromBundle(url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load model";
      setError(errorMessage);
      throw err;
    }
  };
  (0, import_react3.useEffect)(() => {
    setIsInitialized(true);
    return () => {
      engine.cleanup();
    };
  }, [engine]);
  const contextValue = {
    engine,
    loadModel,
    isInitialized,
    error
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelContext.Provider, { value: contextValue, children });
}
function useModelContext() {
  const context = (0, import_react3.useContext)(ModelContext);
  if (!context) {
    throw new Error("useModelContext must be used within a PythonModelProvider");
  }
  return context;
}

// src/components/ModelLoader.tsx
var import_react4 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function ModelLoader({
  modelUrl,
  onLoad,
  onError,
  children
}) {
  const modelResult = useModel(modelUrl);
  (0, import_react4.useEffect)(() => {
    if (modelResult.status === "ready" && modelResult.model && onLoad) {
      onLoad(modelResult.model);
    }
  }, [modelResult.status, modelResult.model, onLoad]);
  (0, import_react4.useEffect)(() => {
    if (modelResult.status === "error" && modelResult.error && onError) {
      onError(new Error(modelResult.error.message));
    }
  }, [modelResult.status, modelResult.error, onError]);
  if (children) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: children(modelResult) });
  }
  switch (modelResult.status) {
    case "loading":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: "Loading Python model..." });
    case "error":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        "Error loading model: ",
        modelResult.error?.message
      ] });
    case "ready":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: "Model loaded successfully" });
    default:
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: "Initializing..." });
  }
}

// src/components/ErrorBoundary.tsx
var import_react5 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var ErrorBoundary = class extends import_react5.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });
    this.props.onError?.(error, errorInfo);
    if (process.env.NODE_ENV === "development") {
      console.error("Error Boundary caught an error:", error);
      console.error("Error Info:", errorInfo);
    }
  }
  componentDidUpdate(prevProps) {
    const { resetOnPropsChange } = this.props;
    const { hasError } = this.state;
    if (hasError && resetOnPropsChange) {
      const hasChanged = resetOnPropsChange.some(
        (prop, index) => prop !== prevProps.resetOnPropsChange?.[index]
      );
      if (hasChanged) {
        this.setState({
          hasError: false,
          error: null,
          errorInfo: null
        });
      }
    }
  }
  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;
    if (hasError && error) {
      if (fallback) {
        return fallback(error, errorInfo);
      }
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: {
        padding: "20px",
        border: "1px solid #ff6b6b",
        borderRadius: "4px",
        backgroundColor: "#ffe0e0",
        margin: "10px 0"
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { style: { color: "#d63031", marginTop: 0 }, children: "Something went wrong" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: { color: "#2d3436" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: "Error:" }),
          " ",
          error.message
        ] }),
        process.env.NODE_ENV === "development" && errorInfo && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("details", { style: { marginTop: "10px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("summary", { style: { cursor: "pointer", color: "#636e72" }, children: "Error Details (Development)" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("pre", { style: {
            whiteSpace: "pre-wrap",
            fontSize: "12px",
            color: "#636e72",
            marginTop: "10px",
            overflow: "auto"
          }, children: [
            error.stack,
            errorInfo.componentStack
          ] })
        ] })
      ] });
    }
    return children;
  }
};
var ModelErrorBoundary = class extends import_react5.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });
    if (this.isModelError(error)) {
      const modelError = this.createModelError(error);
      this.props.onModelError?.(modelError);
    }
    this.props.onError?.(error, errorInfo);
  }
  isModelError(error) {
    const modelErrorPatterns = [
      /model not loaded/i,
      /prediction failed/i,
      /pyodide/i,
      /python/i,
      /worker/i
    ];
    return modelErrorPatterns.some(
      (pattern) => pattern.test(error.message) || pattern.test(error.name)
    );
  }
  createModelError(error) {
    let errorType = "runtime";
    if (error.message.includes("network") || error.message.includes("fetch")) {
      errorType = "network";
    } else if (error.message.includes("timeout")) {
      errorType = "timeout";
    } else if (error.message.includes("validation")) {
      errorType = "validation";
    } else if (error.message.includes("python")) {
      errorType = "python";
    }
    return {
      type: errorType,
      message: error.message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      stack: error.stack,
      details: error
    };
  }
  componentDidUpdate(prevProps) {
    const { resetOnPropsChange } = this.props;
    const { hasError } = this.state;
    if (hasError && resetOnPropsChange) {
      const hasChanged = resetOnPropsChange.some(
        (prop, index) => prop !== prevProps.resetOnPropsChange?.[index]
      );
      if (hasChanged) {
        this.setState({
          hasError: false,
          error: null,
          errorInfo: null
        });
      }
    }
  }
  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;
    if (hasError && error) {
      if (fallback) {
        return fallback(error, errorInfo);
      }
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: {
        padding: "20px",
        border: "1px solid #e17055",
        borderRadius: "8px",
        backgroundColor: "#fff5f5",
        margin: "10px 0",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", marginBottom: "10px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: "24px", marginRight: "10px" }, children: "\u26A0\uFE0F" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { style: { color: "#d63031", margin: 0 }, children: "Model Error" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: { color: "#2d3436", marginBottom: "15px" }, children: "There was an issue with the Python ML model:" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: {
          padding: "12px",
          backgroundColor: "#fff",
          border: "1px solid #ddd",
          borderRadius: "4px",
          fontSize: "14px",
          fontFamily: "monospace",
          color: "#e17055"
        }, children: error.message }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { marginTop: "15px", fontSize: "14px", color: "#636e72" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: "This might be caused by:" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("ul", { style: { margin: "5px 0", paddingLeft: "20px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: "Network connectivity issues" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: "Invalid model format or code" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: "Missing Python dependencies" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: "Browser compatibility issues" })
          ] })
        ] }),
        process.env.NODE_ENV === "development" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("details", { style: { marginTop: "15px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("summary", { style: { cursor: "pointer", color: "#636e72" }, children: "Technical Details (Development)" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("pre", { style: {
            whiteSpace: "pre-wrap",
            fontSize: "11px",
            color: "#636e72",
            marginTop: "10px",
            padding: "10px",
            backgroundColor: "#f8f9fa",
            border: "1px solid #e9ecef",
            borderRadius: "4px",
            overflow: "auto",
            maxHeight: "200px"
          }, children: [
            error.stack,
            errorInfo?.componentStack
          ] })
        ] })
      ] });
    }
    return children;
  }
};
function withErrorBoundary(Component2, errorBoundaryConfig) {
  const WrappedComponent = (props) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ErrorBoundary, { ...errorBoundaryConfig, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Component2, { ...props }) });
  WrappedComponent.displayName = `withErrorBoundary(${Component2.displayName || Component2.name})`;
  return WrappedComponent;
}
function withModelErrorBoundary(Component2, errorBoundaryConfig) {
  const WrappedComponent = (props) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ModelErrorBoundary, { ...errorBoundaryConfig, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Component2, { ...props }) });
  WrappedComponent.displayName = `withModelErrorBoundary(${Component2.displayName || Component2.name})`;
  return WrappedComponent;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ErrorBoundary,
  ModelErrorBoundary,
  ModelLoader,
  PythonModelProvider,
  useModel,
  useModelContext,
  usePythonEngine,
  withErrorBoundary,
  withModelErrorBoundary
});
