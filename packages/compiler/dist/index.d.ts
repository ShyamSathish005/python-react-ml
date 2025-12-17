import { MicroParser } from "./MicroParser";
import { WGSLGenerator } from "./WGSLGenerator";
import { TypeScriptWrapperGenerator } from "./WrapperGenerator";
export { MicroParser, WGSLGenerator, TypeScriptWrapperGenerator };
export declare class Compiler {
    private parser;
    private wgslGenerator;
    private wrapperGenerator;
    constructor();
    compile(pythonCode: string): {
        parsed: import("./MicroParser").ParsedFunction;
        wgsl: string;
        wrapper: string;
    };
}
