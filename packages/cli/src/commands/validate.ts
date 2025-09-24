import fs from 'fs';
import ora from 'ora';

export async function validateModel(entryPath: string): Promise<void> {
  const spinner = ora('Validating Python model...').start();

  try {
    // Check if file exists
    if (!fs.existsSync(entryPath)) {
      throw new Error(`File not found: ${entryPath}`);
    }

    // Read and parse the Python code
    const pythonCode = fs.readFileSync(entryPath, 'utf-8');

    // Basic validation checks
    const validationChecks = [
      {
        name: 'Has predict function',
        check: () => pythonCode.includes('def predict('),
        required: true
      },
      {
        name: 'Has proper imports',
        check: () => pythonCode.includes('import ') || pythonCode.includes('from '),
        required: false
      },
      {
        name: 'No forbidden imports',
        check: () => !pythonCode.includes('import os') && !pythonCode.includes('import subprocess'),
        required: true
      },
      {
        name: 'Has docstrings',
        check: () => pythonCode.includes('"""') || pythonCode.includes("'''"),
        required: false
      },
      {
        name: 'No file system operations',
        check: () => !pythonCode.includes('open(') && !pythonCode.includes('file('),
        required: true
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