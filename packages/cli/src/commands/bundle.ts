import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import chalk from 'chalk';
import ora from 'ora';

export interface BundleOptions {
  output: string;
  name?: string;
  version: string;
  include?: string[];
  deps?: string[];
}

export async function bundleModel(entryPath: string, options: BundleOptions): Promise<void> {
  const spinner = ora('Bundling Python model...').start();

  try {
    // Validate entry file exists
    if (!fs.existsSync(entryPath)) {
      throw new Error(`Entry file not found: ${entryPath}`);
    }

    // Read the Python code
    const pythonCode = fs.readFileSync(entryPath, 'utf-8');

    // Validate Python code has required functions
    if (!pythonCode.includes('def predict(')) {
      spinner.warn('Warning: No predict() function found in Python code');
    }

    // Create manifest
    const manifest = {
      name: options.name || path.basename(entryPath, '.py'),
      version: options.version,
      entry: path.basename(entryPath),
      python_version: '3.11',
      dependencies: options.deps || [],
      runtime_hints: {
        pyodide: true,
        native: false
      },
      created_at: new Date().toISOString()
    };

    spinner.text = 'Creating bundle archive...';

    // Create ZIP archive
    const output = fs.createWriteStream(options.output);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      spinner.succeed(`Bundle created: ${options.output} (${archive.pointer()} bytes)`);
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);

    // Add manifest
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // Add main Python file
    archive.append(pythonCode, { name: path.basename(entryPath) });

    // Add additional files if specified
    if (options.include) {
      for (const filePath of options.include) {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            archive.file(filePath, { name: path.basename(filePath) });
          } else if (stats.isDirectory()) {
            archive.directory(filePath, path.basename(filePath));
          }
        } else {
          spinner.warn(`File not found, skipping: ${filePath}`);
        }
      }
    }

    await archive.finalize();
  } catch (error) {
    spinner.fail('Bundle creation failed');
    throw error;
  }
}