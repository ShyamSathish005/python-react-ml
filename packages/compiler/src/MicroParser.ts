export interface ParsedFunction {
    name: string;
    args: string[];
    op: string;
}

export class MicroParser {
    parse(code: string): ParsedFunction {
        // Regex to match: def function_name(arg1, arg2): return arg1 [OP] arg2
        // Supports +, -, *, /
        const regex = /def\s+(\w+)\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*:\s*return\s+(\w+)\s*([\+\-\*\/])\s*(\w+)/;
        const match = code.match(regex);

        if (!match) {
            throw new Error("Invalid input format. Expected: def name(arg1, arg2): return arg1 [OP] arg2");
        }

        const [_, name, arg1Def, arg2Def, arg1Use, op, arg2Use] = match;

        // specific validation to ensure used args match defined args
        if (arg1Def !== arg1Use || arg2Def !== arg2Use) {
            // It's possible the user wrote "return b + a", but for MVP we might want strict ordering or just check existence.
            // The prompt says "return arg1 [OP] arg2", implying strict structure.
            // Let's check if the used args are the same as defined args.
            if ((arg1Def === arg1Use && arg2Def === arg2Use) || (arg1Def === arg2Use && arg2Def === arg1Use)) {
                // This is fine, arguments are valid.
            } else {
                throw new Error("Function body arguments must match function definition arguments.");
            }
        }

        return {
            name,
            args: [arg1Def, arg2Def],
            op
        };
    }
}
