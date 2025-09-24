#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/cli.ts
var import_commander = require("commander");
var import_chalk = __toESM(require("chalk"));

// src/commands/bundle.ts
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_archiver = __toESM(require("archiver"));
var import_ora = __toESM(require("ora"));
async function bundleModel(entryPath, options) {
  const spinner = (0, import_ora.default)("Bundling Python model...").start();
  try {
    if (!import_fs.default.existsSync(entryPath)) {
      throw new Error(`Entry file not found: ${entryPath}`);
    }
    const pythonCode = import_fs.default.readFileSync(entryPath, "utf-8");
    if (!pythonCode.includes("def predict(")) {
      spinner.warn("Warning: No predict() function found in Python code");
    }
    const manifest = {
      name: options.name || import_path.default.basename(entryPath, ".py"),
      version: options.version,
      entry: import_path.default.basename(entryPath),
      python_version: "3.11",
      dependencies: options.deps || [],
      runtime_hints: {
        pyodide: true,
        native: false
      },
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    spinner.text = "Creating bundle archive...";
    const output = import_fs.default.createWriteStream(options.output);
    const archive = (0, import_archiver.default)("zip", { zlib: { level: 9 } });
    output.on("close", () => {
      spinner.succeed(`Bundle created: ${options.output} (${archive.pointer()} bytes)`);
    });
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(output);
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    archive.append(pythonCode, { name: import_path.default.basename(entryPath) });
    if (options.include) {
      for (const filePath of options.include) {
        if (import_fs.default.existsSync(filePath)) {
          const stats = import_fs.default.statSync(filePath);
          if (stats.isFile()) {
            archive.file(filePath, { name: import_path.default.basename(filePath) });
          } else if (stats.isDirectory()) {
            archive.directory(filePath, import_path.default.basename(filePath));
          }
        } else {
          spinner.warn(`File not found, skipping: ${filePath}`);
        }
      }
    }
    await archive.finalize();
  } catch (error) {
    spinner.fail("Bundle creation failed");
    throw error;
  }
}

// src/commands/validate.ts
var import_fs2 = __toESM(require("fs"));
var import_ora2 = __toESM(require("ora"));
async function validateModel(entryPath) {
  const spinner = (0, import_ora2.default)("Validating Python model...").start();
  try {
    if (!import_fs2.default.existsSync(entryPath)) {
      throw new Error(`File not found: ${entryPath}`);
    }
    const pythonCode = import_fs2.default.readFileSync(entryPath, "utf-8");
    const validationChecks = [
      {
        name: "Has predict function",
        check: () => pythonCode.includes("def predict("),
        required: true
      },
      {
        name: "Has proper imports",
        check: () => pythonCode.includes("import ") || pythonCode.includes("from "),
        required: false
      },
      {
        name: "No forbidden imports",
        check: () => !pythonCode.includes("import os") && !pythonCode.includes("import subprocess"),
        required: true
      },
      {
        name: "Has docstrings",
        check: () => pythonCode.includes('"""') || pythonCode.includes("'''"),
        required: false
      },
      {
        name: "No file system operations",
        check: () => !pythonCode.includes("open(") && !pythonCode.includes("file("),
        required: true
      }
    ];
    let passedChecks = 0;
    let requiredChecks = 0;
    for (const check of validationChecks) {
      if (check.required)
        requiredChecks++;
      if (check.check()) {
        passedChecks++;
        spinner.succeed(check.name);
      } else if (check.required) {
        spinner.fail(`${check.name} (Required)`);
        throw new Error(`Validation failed: ${check.name}`);
      } else {
        spinner.warn(`${check.name} (Optional)`);
      }
    }
    spinner.succeed(`Validation passed (${passedChecks}/${validationChecks.length} checks)`);
  } catch (error) {
    spinner.fail("Validation failed");
    throw error;
  }
}

// src/commands/init.ts
var import_fs3 = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));
var import_ora3 = __toESM(require("ora"));
var templates = {
  basic: {
    name: "Basic Python Model",
    files: {
      "model.py": `"""
Basic Python ML model template for Python React ML

This template provides a starting point for creating ML models
that can be used in React and React Native applications.
"""

import numpy as np

# Example: Simple linear regression model
class SimpleModel:
    def __init__(self):
        # Initialize your model here
        self.weights = np.array([1.0, 0.5])
        self.bias = 0.1
    
    def predict_single(self, features):
        """Predict for a single sample"""
        return np.dot(features, self.weights) + self.bias
    
    def predict_batch(self, features_batch):
        """Predict for multiple samples"""
        return np.dot(features_batch, self.weights) + self.bias

# Global model instance
model = SimpleModel()

def predict(input_data):
    """
    Main prediction function - this is required!
    
    Args:
        input_data: Input features (list or numpy array)
    
    Returns:
        Prediction result
    """
    try:
        features = np.array(input_data)
        
        if features.ndim == 1:
            # Single prediction
            return float(model.predict_single(features))
        else:
            # Batch prediction
            return model.predict_batch(features).tolist()
    except Exception as e:
        raise Exception(f"Prediction failed: {str(e)}")

def get_model_info():
    """
    Optional function to provide model information
    
    Returns:
        Dictionary with model metadata
    """
    return {
        "name": "Simple Linear Model",
        "version": "1.0.0",
        "type": "regression",
        "input_shape": [2],
        "output_shape": [1],
        "description": "A simple linear regression model for demonstration"
    }
`,
      "README.md": `# Python React ML Project

This project was created using the Python React ML CLI.

## Files

- \`model.py\` - Your Python ML model
- \`package.json\` - Node.js dependencies for React integration
- \`README.md\` - This file

## Usage

### 1. Develop your model
Edit \`model.py\` to implement your machine learning model. Make sure to:
- Implement a \`predict(input_data)\` function
- Handle both single and batch predictions
- Add proper error handling

### 2. Validate your model
\`\`\`bash
python-react-ml validate model.py
\`\`\`

### 3. Bundle for deployment
\`\`\`bash
python-react-ml bundle model.py -o my-model.bundle.zip
\`\`\`

### 4. Use in React
\`\`\`jsx
import { useModel } from '@python-react-ml/react';

function MyComponent() {
  const { model, status, predict } = useModel('/path/to/my-model.bundle.zip');
  
  const handlePredict = async () => {
    if (model) {
      const result = await predict([1.0, 2.0]);
      console.log('Prediction:', result);
    }
  };
  
  return (
    <div>
      <p>Status: {status}</p>
      <button onClick={handlePredict} disabled={status !== 'ready'}>
        Predict
      </button>
    </div>
  );
}
\`\`\`

## Documentation

Visit [GitHub](https://github.com/yourusername/python-react-ml) for full documentation.
`,
      "package.json": `{
  "name": "my-python-react-ml-project",
  "version": "1.0.0",
  "description": "Python React ML project",
  "main": "index.js",
  "scripts": {
    "validate": "python-react-ml validate model.py",
    "bundle": "python-react-ml bundle model.py",
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@python-react-ml/core": "^0.1.0",
    "@python-react-ml/react": "^0.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@python-react-ml/cli": "^0.1.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.4.0"
  }
}`
    }
  }
};
async function initProject(projectName, options = { template: "basic" }) {
  const spinner = (0, import_ora3.default)("Initializing Python React ML project...").start();
  try {
    const name = projectName || "python-react-ml-project";
    const projectPath = import_path2.default.resolve(name);
    if (import_fs3.default.existsSync(projectPath)) {
      throw new Error(`Directory already exists: ${projectPath}`);
    }
    const template = templates[options.template];
    if (!template) {
      throw new Error(`Unknown template: ${options.template}`);
    }
    spinner.text = `Creating project directory: ${name}`;
    import_fs3.default.mkdirSync(projectPath, { recursive: true });
    spinner.text = "Creating project files...";
    for (const [filename, content] of Object.entries(template.files)) {
      const filePath = import_path2.default.join(projectPath, filename);
      const processedContent = content.replace(/my-python-react-ml-project/g, name).replace(/My Python React ML Project/g, name.split("-").map(
        (word) => word.charAt(0).toUpperCase() + word.slice(1)
      ).join(" "));
      import_fs3.default.writeFileSync(filePath, processedContent);
    }
    spinner.succeed(`Project initialized: ${name}`);
    console.log(`
Next steps:`);
    console.log(`  cd ${name}`);
    console.log(`  npm install`);
    console.log(`  python-react-ml validate model.py`);
    console.log(`  python-react-ml bundle model.py
`);
  } catch (error) {
    spinner.fail("Project initialization failed");
    throw error;
  }
}

// src/cli.ts
var program = new import_commander.Command();
program.name("python-react-ml").description("CLI tools for Python React ML framework").version("0.1.0");
program.command("bundle").description("Bundle a Python model for use in React/React Native").argument("<entry>", "Path to the main Python file").option("-o, --output <path>", "Output bundle path", "model.bundle.zip").option("-n, --name <name>", "Model name").option("-v, --version <version>", "Model version", "1.0.0").option("--include <files...>", "Additional files to include").option("--deps <packages...>", "Python dependencies").action(async (entry, options) => {
  try {
    await bundleModel(entry, options);
    console.log(import_chalk.default.green("\u2713 Model bundled successfully"));
  } catch (error) {
    console.error(import_chalk.default.red("\u2717 Bundle failed:"), error.message);
    process.exit(1);
  }
});
program.command("validate").description("Validate a Python model for compatibility").argument("<entry>", "Path to the Python file to validate").action(async (entry) => {
  try {
    await validateModel(entry);
    console.log(import_chalk.default.green("\u2713 Model validation passed"));
  } catch (error) {
    console.error(import_chalk.default.red("\u2717 Validation failed:"), error.message);
    process.exit(1);
  }
});
program.command("init").description("Initialize a new Python React ML project").argument("[name]", "Project name").option("-t, --template <template>", "Project template", "basic").action(async (name, options) => {
  try {
    await initProject(name, options);
    console.log(import_chalk.default.green("\u2713 Project initialized successfully"));
  } catch (error) {
    console.error(import_chalk.default.red("\u2717 Initialization failed:"), error.message);
    process.exit(1);
  }
});
program.parse();
