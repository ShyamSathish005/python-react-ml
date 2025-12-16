import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PythonModelManifest } from 'python-react-ml';

export interface BundleOptions {
  entry: string;
  output: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: string[];
  pythonVersion?: string;
  memoryLimit?: number;
  timeout?: number;
}

export class ManifestGenerator {
  private calculateSha256(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  private collectFiles(entryPath: string, baseDir: string): { [path: string]: any } {
    const files: { [path: string]: any } = {};
    const stats = fs.statSync(entryPath);

    if (stats.isFile()) {
      const relativePath = path.relative(baseDir, entryPath);
      files[relativePath] = {
        size: stats.size,
        sha256: this.calculateSha256(entryPath),
        type: path.extname(entryPath) === '.py' ? 'python' : 'other'
      };
    } else if (stats.isDirectory()) {
      const entries = fs.readdirSync(entryPath);
      for (const entry of entries) {
        const fullPath = path.join(entryPath, entry);
        Object.assign(files, this.collectFiles(fullPath, baseDir));
      }
    }

    return files;
  }

  generateManifest(options: BundleOptions): PythonModelManifest {
    const entryDir = path.dirname(options.entry);
    const files = this.collectFiles(entryDir, entryDir);

    // Calculate bundle hash
    const bundleContent = JSON.stringify(files, null, 2);
    const bundleHash = crypto.createHash('sha256').update(bundleContent).digest('hex');

    const manifest: PythonModelManifest = {
      name: options.name,
      version: options.version,
      description: options.description || `Python ML model: ${options.name}`,
      author: options.author,
      license: 'MIT',

      // Default to pyodide for CLI bundles
      runtime: 'pyodide',
      inputs: [], // To be populated by analysis
      outputs: [],

      entrypoint: path.basename(options.entry),
      python_version: options.pythonVersion || '3.11',
      dependencies: options.dependencies || [],

      bundle_version: '1.0',
      sha256: bundleHash,
      created_at: new Date().toISOString(),

      runtime_hints: {
        pyodide: true,
        native: false,
        memory_limit: options.memoryLimit || 512,
        timeout: options.timeout || 30000
      },

      functions: {
        predict: {
          description: 'Main prediction function',
          inputs: { data: 'any' },
          outputs: { result: 'any' }
        }
      },

      files
    };

    return manifest;
  }

  validateManifest(manifest: PythonModelManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!manifest.name) errors.push('Missing required field: name');
    if (!manifest.version) errors.push('Missing required field: version');
    if (!manifest.entrypoint) errors.push('Missing required field: entrypoint');
    if (!manifest.python_version) errors.push('Missing required field: python_version');
    if (!manifest.sha256) errors.push('Missing required field: sha256');

    // Validate version format
    if (manifest.version && !/^\d+\.\d+(\.\d+)?/.test(manifest.version)) {
      errors.push('Invalid version format. Expected: x.y or x.y.z');
    }

    // Validate Python version
    if (manifest.python_version && !/^3\.\d+(\.\d+)?/.test(manifest.python_version)) {
      errors.push('Invalid Python version. Expected: 3.x format');
    }

    // Validate dependencies format
    if (manifest.dependencies) {
      for (const dep of manifest.dependencies) {
        if (!dep || typeof dep !== 'string') {
          errors.push(`Invalid dependency format: ${dep}`);
        }
      }
    }

    // Validate SHA256 format
    if (manifest.sha256 && !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
      errors.push('Invalid SHA256 hash format');
    }

    return { valid: errors.length === 0, errors };
  }
}