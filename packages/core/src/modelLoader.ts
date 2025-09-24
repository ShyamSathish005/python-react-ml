import JSZip from 'jszip';
import type { ModelBundle, PythonModelManifest } from './types';

export async function fetchBundle(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bundle: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

export async function extractBundle(bundleBytes: ArrayBuffer): Promise<ModelBundle> {
  const zip = new JSZip();
  const zipContents = await zip.loadAsync(bundleBytes);
  
  // Read manifest
  const manifestFile = zipContents.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Bundle must contain manifest.json');
  }
  
  const manifestContent = await manifestFile.async('string');
  const manifest: PythonModelManifest = JSON.parse(manifestContent);
  
  // Read main Python file
  const entryFile = zipContents.file(manifest.entry);
  if (!entryFile) {
    throw new Error(`Entry file '${manifest.entry}' not found in bundle`);
  }
  
  const code = await entryFile.async('string');
  
  // Read additional files
  const files: Record<string, ArrayBuffer> = {};
  for (const [filename, file] of Object.entries(zipContents.files)) {
    if (filename !== 'manifest.json' && filename !== manifest.entry && !(file as any).dir) {
      files[filename] = await (file as any).async('arraybuffer');
    }
  }
  
  return { manifest, code, files };
}

export async function loadPythonFile(filePath: string): Promise<{ code: string; manifest?: PythonModelManifest }> {
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error(`Failed to load Python file: ${response.status} ${response.statusText}`);
  }
  
  const code = await response.text();
  
  // Try to load accompanying manifest if it exists
  let manifest: PythonModelManifest | undefined;
  try {
    const manifestPath = filePath.replace(/\.py$/, '_manifest.json');
    const manifestResponse = await fetch(manifestPath);
    if (manifestResponse.ok) {
      manifest = await manifestResponse.json();
    }
  } catch {
    // Manifest is optional
  }
  
  return { code, manifest };
}