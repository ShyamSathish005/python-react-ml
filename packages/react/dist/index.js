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
  ModelLoader: () => ModelLoader,
  PythonModelProvider: () => PythonModelProvider,
  useModel: () => useModel,
  useModelContext: () => useModelContext,
  usePythonEngine: () => usePythonEngine
});
module.exports = __toCommonJS(src_exports);

// src/hooks/useModel.ts
var import_react = require("react");
var import_core = require("@python-react-ml/core");
function useModel(modelUrl) {
  const [model, setModel] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)("idle");
  const [error, setError] = (0, import_react.useState)(null);
  const engine = new import_core.PythonReactML({ platform: "web" });
  const loadModel = (0, import_react.useCallback)(async () => {
    if (!modelUrl)
      return;
    setStatus("loading");
    setError(null);
    try {
      const loadedModel = await engine.loadModelFromBundle(modelUrl);
      setModel(loadedModel);
      setStatus("ready");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load model";
      setError(errorMessage);
      setStatus("error");
      console.error("Model loading failed:", err);
    }
  }, [modelUrl]);
  const predict = (0, import_react.useCallback)(async (input) => {
    if (!model) {
      throw new Error("Model not loaded");
    }
    return await model.predict(input);
  }, [model]);
  const reload = (0, import_react.useCallback)(async () => {
    setModel(null);
    await loadModel();
  }, [loadModel]);
  (0, import_react.useEffect)(() => {
    if (modelUrl) {
      loadModel();
    }
    return () => {
      if (model) {
        model.cleanup?.();
      }
      engine.cleanup();
    };
  }, [modelUrl, loadModel]);
  return {
    model,
    status,
    error,
    predict,
    reload
  };
}

// src/hooks/usePythonEngine.ts
var import_react2 = require("react");
var import_core2 = require("@python-react-ml/core");
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
      const engine = new import_core2.PythonReactML({
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
var import_core3 = require("@python-react-ml/core");
var import_jsx_runtime = require("react/jsx-runtime");
var ModelContext = (0, import_react3.createContext)(void 0);
function PythonModelProvider({
  children,
  pyodideUrl,
  enableLogging = false
}) {
  const [engine] = (0, import_react3.useState)(() => new import_core3.PythonReactML({
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
      onError(new Error(modelResult.error));
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
        modelResult.error
      ] });
    case "ready":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: "Model loaded successfully" });
    default:
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: "Initializing..." });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ModelLoader,
  PythonModelProvider,
  useModel,
  useModelContext,
  usePythonEngine
});
