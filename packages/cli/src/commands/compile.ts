import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Compiler } from '@python-react-ml/compiler';

export async function compileModel(entry: string, options: any): Promise<void> {
    console.log(chalk.blue(`⚙️  Compiling Python logic from ${entry}...`));

    if (!fs.existsSync(entry)) {
        throw new Error(`Entry file not found: ${entry}`);
    }

    const pythonCode = fs.readFileSync(entry, 'utf-8');
    const compiler = new Compiler();

    try {
        const { wrapper, wgsl } = compiler.compile(pythonCode);

        // Determine output path
        let outputPath = options.output;
        if (!outputPath) {
            const dir = path.dirname(entry);
            const name = path.basename(entry, path.extname(entry));
            outputPath = path.join(dir, `${name}.ts`);
        }

        fs.writeFileSync(outputPath, wrapper);
        console.log(chalk.green(`✓ Compiled to TypeScript wrapper: ${outputPath}`));

        if (options.verbose) {
            console.log(chalk.gray('\nDat WGSL Code:\n'));
            console.log(chalk.cyan(wgsl));
        }

    } catch (error) {
        console.error(chalk.red('✗ Compilation failed:'));
        if (error instanceof Error) {
            console.error(error.message);
        } else {
            console.error(String(error));
        }
        process.exit(1);
    }
}
