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
  PythonReactMLNative: () => PythonReactMLNative,
  useModelNative: () => useModelNative
});
module.exports = __toCommonJS(src_exports);

// src/PythonReactMLNative.ts
var import_react_native = require("react-native");
var LINKING_ERROR = `The package '@shyamsathish005/python-react-ml-react-native' doesn't seem to be linked. Make sure: 

` + import_react_native.Platform.select({ ios: "- You have run 'cd ios && pod install'\n", default: "" }) + "- You rebuilt the app after installing the package\n- You are not using Expo managed workflow\n";
var PythonReactML = import_react_native.NativeModules.PythonReactML ? import_react_native.NativeModules.PythonReactML : new Proxy(
  {},
  {
    get() {
      throw new Error(LINKING_ERROR);
    }
  }
);
var PythonReactMLNative = class {
  static async initialize() {
    try {
      return await PythonReactML.initialize();
    } catch (error) {
      console.error("Failed to initialize Python engine:", error);
      return false;
    }
  }
  static async loadModel(bundlePath) {
    try {
      return await PythonReactML.loadModel(bundlePath);
    } catch (error) {
      throw new Error(`Failed to load model: ${error}`);
    }
  }
  static async predict(modelId, input) {
    try {
      const result = await PythonReactML.predict(modelId, input);
      if (result.success) {
        return result.result;
      } else {
        throw new Error(result.error || "Prediction failed");
      }
    } catch (error) {
      throw new Error(`Prediction failed: ${error}`);
    }
  }
  static async getModelInfo(modelId) {
    try {
      const result = await PythonReactML.getModelInfo(modelId);
      if (result.success) {
        return result.result;
      } else {
        throw new Error(result.error || "Failed to get model info");
      }
    } catch (error) {
      throw new Error(`Failed to get model info: ${error}`);
    }
  }
  static async unloadModel(modelId) {
    try {
      await PythonReactML.unloadModel(modelId);
    } catch (error) {
      console.warn("Failed to unload model:", error);
    }
  }
  static async cleanup() {
    try {
      await PythonReactML.cleanup();
    } catch (error) {
      console.warn("Failed to cleanup Python engine:", error);
    }
  }
};

// src/hooks/useModelNative.ts
var import_react = require("react");
function useModelNative(modelPath) {
  const [state, setState] = (0, import_react.useState)({
    modelId: null,
    isLoaded: false,
    isLoading: false,
    error: null
  });
  const loadModel = (0, import_react.useCallback)(async (path) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await PythonReactMLNative.initialize();
      const modelId = await PythonReactMLNative.loadModel(path);
      setState((prev) => ({
        ...prev,
        modelId,
        isLoaded: true,
        isLoading: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load model";
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }));
    }
  }, []);
  const predict = (0, import_react.useCallback)(async (input) => {
    if (!state.modelId) {
      throw new Error("No model loaded");
    }
    try {
      return await PythonReactMLNative.predict(state.modelId, input);
    } catch (error) {
      throw new Error(`Prediction failed: ${error}`);
    }
  }, [state.modelId]);
  const getInfo = (0, import_react.useCallback)(async () => {
    if (!state.modelId) {
      throw new Error("No model loaded");
    }
    try {
      return await PythonReactMLNative.getModelInfo(state.modelId);
    } catch (error) {
      throw new Error(`Failed to get model info: ${error}`);
    }
  }, [state.modelId]);
  const unload = (0, import_react.useCallback)(async () => {
    if (state.modelId) {
      await PythonReactMLNative.unloadModel(state.modelId);
      setState((prev) => ({
        ...prev,
        modelId: null,
        isLoaded: false,
        error: null
      }));
    }
  }, [state.modelId]);
  const reload = (0, import_react.useCallback)(async () => {
    if (modelPath) {
      await unload();
      await loadModel(modelPath);
    }
  }, [modelPath, unload, loadModel]);
  (0, import_react.useEffect)(() => {
    if (modelPath && !state.isLoaded && !state.isLoading) {
      loadModel(modelPath);
    }
  }, [modelPath, loadModel, state.isLoaded, state.isLoading]);
  (0, import_react.useEffect)(() => {
    return () => {
      if (state.modelId) {
        PythonReactMLNative.unloadModel(state.modelId);
      }
    };
  }, []);
  return {
    ...state,
    loadModel,
    predict,
    getInfo,
    unload,
    reload
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PythonReactMLNative,
  useModelNative
});
