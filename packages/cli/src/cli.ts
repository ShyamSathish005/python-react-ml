#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { bundleModel } from './commands/bundle';
import { validateModel } from './commands/validate';
import { initProject } from './commands/init';

const program = new Command();

program
  .name('python-react-ml')
  .description('CLI tools for Python React ML framework')
  .version('1.0.0');

// Bundle command
program
  .command('bundle')
  .description('Bundle a Python model for use in React/React Native')
  .argument('<entry>', 'Path to the main Python file')
  .option('-o, --output <path>', 'Output bundle path', 'model.bundle.zip')
  .option('-n, --name <name>', 'Model name')
  .option('-v, --version <version>', 'Model version', '1.0.0')
  .option('--include <files...>', 'Additional files to include')
  .option('--deps <packages...>', 'Python dependencies')
  .action(async (entry, options) => {
    try {
      await bundleModel(entry, options);
      console.log(chalk.green('✓ Model bundled successfully'));
    } catch (error) {
      console.error(chalk.red('✗ Bundle failed:'), (error as Error).message);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate a Python model for compatibility')
  .argument('<entry>', 'Path to the Python file to validate')
  .action(async (entry) => {
    try {
      await validateModel(entry);
      console.log(chalk.green('✓ Model validation passed'));
    } catch (error) {
      console.error(chalk.red('✗ Validation failed:'), (error as Error).message);
      process.exit(1);
    }
  });

// Init command
program
  .command('init')
  .description('Initialize a new Python React ML project')
  .argument('[name]', 'Project name')
  .option('-t, --template <template>', 'Project template', 'basic')
  .action(async (name, options) => {
    try {
      await initProject(name, options);
      console.log(chalk.green('✓ Project initialized successfully'));
    } catch (error) {
      console.error(chalk.red('✗ Initialization failed:'), (error as Error).message);
      process.exit(1);
    }
  });

program.parse();