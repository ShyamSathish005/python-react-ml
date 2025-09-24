import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import JSZip from 'jszip';
import ora from 'ora';
import { ManifestGenerator } from '../utils/manifestGenerator';
import { PythonModelManifest } from 'python-react-ml';

export async function validateModel(entry: string): Promise<void> {
  console.log(`🔍 Validating model ${entry}...`);
  
  if (entry.endsWith('.zip')) {
    await validateBundle(entry);
  } else if (entry.endsWith('.py')) {
    await validatePythonFile(entry);
  } else {
    throw new Error('Entry must be a Python file (.py) or bundle (.zip)');
  }
  
  console.log('✅ Model validation completed');
}

async function validateBundle(bundlePath: string): Promise<void> {
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Bundle file not found: ${bundlePath}`);
  }
  
  const spinner = ora('Loading bundle...').start();
  
  try {
    const bundleData = fs.readFileSync(bundlePath);
    const zip = await JSZip.loadAsync(bundleData);
    
    // Check manifest exists
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error('Bundle missing manifest.json');
    }
    
    spinner.text = 'Validating manifest...';
    
    // Parse and validate manifest
    const manifestContent = await manifestFile.async('text');
    let manifest: PythonModelManifest;
    
    try {
      manifest = JSON.parse(manifestContent);
    } catch (error) {
      throw new Error(`Invalid manifest JSON: ${(error as Error).message}`);
    }
    
    const manifestGen = new ManifestGenerator();
    const validation = manifestGen.validateManifest(manifest);
    
    if (!validation.valid) {
      spinner.fail('Manifest validation failed');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      throw new Error('Invalid manifest');
    }
    
    spinner.succeed('Manifest is valid');
    console.log('✅ Model validation completed');
  } catch (error) {
    spinner.fail('Validation failed');
    throw error;
  }
}

async function validatePythonFile(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Python file not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const spinner = ora('Validating Python file...').start();
  
  try {
    // Basic validation checks
    const validationChecks = [
      {
        name: 'Has predict function',
        check: () => content.includes('def predict('),
        required: true
      },
      {
        name: 'Has docstrings',
        check: () => content.includes('"""') || content.includes("'''"),
        required: false
      },
      {
        name: 'No file system operations',
        check: () => !content.includes('open(') && !content.includes('file('),
        required: true
      },
      {
        name: 'No subprocess imports',
        check: () => !content.includes('import os') && !content.includes('import subprocess'),
        required: true
      },
      {
        name: 'Has proper imports',
        check: () => content.includes('import ') || content.includes('from '),
        required: false
      }
    ];

    let passedChecks = 0;
    let requiredChecks = 0;

    for (const check of validationChecks) {
      if (check.required) requiredChecks++;
      
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
    spinner.fail('Validation failed');
    throw error;
  }
}