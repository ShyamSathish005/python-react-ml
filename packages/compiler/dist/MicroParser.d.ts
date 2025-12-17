export interface ParsedFunction {
    name: string;
    args: string[];
    op: string;
}
export declare class MicroParser {
    parse(code: string): ParsedFunction;
}
