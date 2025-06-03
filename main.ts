const LED_TOOL_DEF: McpTool = {
    name: "led.set",
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
    handler: (args: { x: number; y: number; on: number }) => {
        const x = args.x || 0;
        const y = args.y || 0;
        const on = !!args.on;
        const ok = x >= 0 && x <= 4 && y >= 0 && y <= 4;
        if (on) led.plot(x, y);
        else led.unplot(x, y);
        return `(${x}, ${y}) is ${on ? `on` : `off`}`
    }
};

mcp.startServer()