import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import ora from 'ora';
import chalk from 'chalk';

interface OptimizeOptions {
    output?: string;
    type?: 'int8' | 'uint8';
}

export async function optimizeModel(input: string, options: OptimizeOptions): Promise<void> {
    const inputPath = path.resolve(input);
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }

    if (!inputPath.endsWith('.onnx')) {
        throw new Error('Only .onnx models are supported for optimization');
    }

    const outputPath = options.output
        ? path.resolve(options.output)
        : inputPath.replace('.onnx', '.quant.onnx');

    const quantType = options.type === 'int8' ? 'QInt8' : 'QUInt8';

    const spinner = ora('Optimizing model...').start();

    // Create temporary python script
    const scriptContent = `
import onnx
from onnxruntime.quantization import quantize_dynamic, QuantType

input_model_path = "${inputPath.replace(/\\/g, '\\\\')}"
output_model_path = "${outputPath.replace(/\\/g, '\\\\')}"

print(f"Quantizing {input_model_path} to {output_model_path}...")

try:
    quantize_dynamic(
        input_model_path,
        output_model_path,
        weight_type=QuantType.${quantType}
    )
    print("Quantization complete")
except Exception as e:
    print(f"Error: {e}")
    exit(1)
`;

    const scriptPath = path.join(path.dirname(inputPath), '_quantize_tmp.py');
    fs.writeFileSync(scriptPath, scriptContent);

    try {
        await runPythonScript(scriptPath);
        spinner.succeed(`Model optimized: ${path.basename(outputPath)}`);

        // Check size reduction
        const originalSize = fs.statSync(inputPath).size;
        const newSize = fs.statSync(outputPath).size;
        const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);

        console.log(chalk.blue(`Size reduced by ${reduction}% (${formatBytes(originalSize)} -> ${formatBytes(newSize)})`));

    } catch (error) {
        spinner.fail('Optimization failed');
        throw error;
    } finally {
        if (fs.existsSync(scriptPath)) {
            fs.unlinkSync(scriptPath);
        }
    }
}

function runPythonScript(scriptPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python', [scriptPath]);

        pythonProcess.stdout.on('data', (data) => {
            // console.log(data.toString()); // Optional logging
        });

        pythonProcess.stderr.on('data', (data) => {
            // console.error(data.toString());
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Python process exited with code ${code}. Ensure 'onnx' and 'onnxruntime' are installed.`));
            }
        });
    });
}

function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
