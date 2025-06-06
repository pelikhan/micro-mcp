const ledTool: McpTool = {
    definition: {
        name: "led_set",
        description: "Turn a pixel on the 5×5 LED matrix on or off",
        inputSchema: {
            type: "object",
            properties: {
                x: { type: "integer", description: "Column (0-4)" },
                y: { type: "integer", description: "Row (0-4)" },
                on: { type: "boolean", description: "true → on, false → off" },
            },
            required: ["x", "y", "on"],
        },
        annotations: {
            title: "Set LED",
            idempotentHint: true,
        },
    },
    handler: (args: { x: number; y: number; on: number }) => {
        const x = args.x || 0
        const y = args.y || 0
        const on = !!args.on
        if (on) led.plot(x, y)
        else led.unplot(x, y)
        return `(${x}, ${y}) is ${on ? `on` : `off`}`
    },
}
const readTemperature: McpTool = {
    definition: {
        name: "read_temperature",
        description:
            "Read the temperature from the micro:bit's built-in sensor",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
        annotations: {
            title: "Read Temperature",
            readOnlyHint: true,
            idempotentHint: true,
        },
    },
    handler: () => {
        return input.temperature() // Simulated temperature reading
    },
}
const showNumberTool: McpTool = {
    definition: {
        name: "show_number",
        description: "Show a number on the 5 x 5 LED matrix",
        inputSchema: {
            type: "object",
            properties: {
                number: { type: "integer", description: "Integer to show" },
            },
            required: ["number"],
        },
        annotations: {
            title: "Show Number",
            idempotentHint: true,
        },
    },
    handler: (args: { number: number }) => {
        const number = args.number || 0
        basic.showNumber(number)
        return `ok`
    },
}
const temperatureResource: McpResource = {
    definition: {
        uri: "temperature",
        name: "temperature",
        description: "The current temperature in degrees Celsius",
    },
    handler: () => input.temperature(),
}

mcp.tool(ledTool)
mcp.tool(showNumberTool)
mcp.tool(readTemperature)
//mcp.resource(temperatureResource)
mcp.startServer(
    "The micro:bit has a temperature sensor and a 5x5 LED matrix. It is located outside of the building. You can show numbers, turn on LEDs, and read the temperature using tools.",
)
