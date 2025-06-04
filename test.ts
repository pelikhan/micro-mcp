const ledTool: McpTool = {
    definition: {
        name: "led_set",
        description: "Turn a pixel on the 5×5 LED matrix on or off",
        inputSchema: {
            type: "object",
            properties: {
                x: { type: "integer", description: "Column (0-4)" },
                y: { type: "integer", description: "Row (0-4)" },
                on: { type: "boolean", description: "true → on, false → off" }
            },
            required: ["x", "y", "on"]
        },
    },
    handler: (args: { x: number; y: number; on: number }) => {
        const x = args.x || 0;
        const y = args.y || 0;
        const on = !!args.on;
        if (on) led.plot(x, y);
        else led.unplot(x, y);
        return `(${x}, ${y}) is ${on ? `on` : `off`}`
    }
};
const showNumberTool: McpTool = {
    definition: {
        name: "show_number",
        description: "Show a number on the 5×5 LED matrix",
        inputSchema: {
            type: "object",
            properties: {
                number: { type: "integer", description: "Number to show (0-9)" }
            },
            required: ["number"]
        },
        annotations: {
            title: "Show Number",
            idempotentHint: true,
            readOnlyHint: true,
        }
    },
    handler: (args: { number: number }) => {
        const number = args.number || 0;
        basic.showNumber(number);
        return `ok`;
    }
};

mcp.startServer()
//mcp.tool(ledTool)
mcp.tool(showNumberTool)
