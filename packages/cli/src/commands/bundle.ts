import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import chalk from 'chalk';
import ora from 'ora';
import { ManifestGenerator, BundleOptions } from '../utils/manifestGenerator';

export async function bundleModel(entry: string, options: any): Promise<void> {
  console.log(`🔨 Bundling model from ${entry}...`);
  
  // Validate entry file exists
  if (!fs.existsSync(entry)) {
    throw new Error(`Entry file not found: ${entry}`);
  }
  
  const outputPath = options.output || 'model.bundle.zip';
  const manifestGen = new ManifestGenerator();
  
  // Generate comprehensive manifest
  const bundleOptions: BundleOptions = {
    entry,
    output: outputPath,
    name: options.name || path.basename(entry, '.py'),
    version: options.version || '1.0.0',
    description: options.description,
    author: options.author,
    dependencies: options.deps || [],
    pythonVersion: options.pythonVersion || '3.11',
    memoryLimit: options.memoryLimit,
    timeout: options.timeout
  };
  
  const manifest = manifestGen.generateManifest(bundleOptions);
  
  // Validate manifest
  const validation = manifestGen.validateManifest(manifest);
  if (!validation.valid) {
    console.error('❌ Manifest validation failed:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Invalid manifest');
  }
  
  console.log('✅ Manifest generated and validated');
  
  // Create ZIP bundle
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`✅ Bundle created: ${outputPath} (${archive.pointer()} bytes)`);
      console.log(`📋 Manifest: ${manifest.name} v${manifest.version}`);
      console.log(`🔒 SHA256: ${manifest.sha256}`);
      resolve();
    });

    archive.on('error', reject);
    archive.pipe(output);
    
    // Add all files from manifest
    const entryDir = path.dirname(entry);
    for (const [filePath, fileInfo] of Object.entries(manifest.files)) {
      const fullPath = path.join(entryDir, filePath);
      if (fs.existsSync(fullPath)) {
        archive.file(fullPath, { name: filePath });
      }
    }
    
    // Add manifest.json
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    
    archive.finalize();
  });
}