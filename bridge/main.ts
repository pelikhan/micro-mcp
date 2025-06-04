// serial-stdio.mts
import { SerialPort } from "serialport"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import debug from "debug"

interface McpToolDefinition {
    name: string
    description: string
    inputSchema: {
        type: "object",
        properties: { [index: string]: any; }
        required: string[]
    }
}


const dbgmcp = debug("micro:mcp")
const dbgmbit = debug("micro:bit")

const tools: {
    definition: McpToolDefinition
    handler: (params: any) => Promise<any>
}[] = []
await startMicrobitPort()
await startMcpPort()

const MCP_TOOL_NAME = 0x01

async function startMcpPort() {
    dbgmcp("starting")
    const server = new Server(
        {
            name: "BBC micro:bit",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {
                    listChanged: true,
                    list: true,
                },
            },
        }
    )
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        dbgmcp("List tools request")
        return {
            tools: tools.map(tool => tool.definition),
        }
    })
    const transport = new StdioServerTransport()
    await server.connect(transport)
}

async function startMicrobitPort() {
    dbgmbit("starting")
    const ports = await SerialPort.list()
    const MICROBIT_VENDOR_ID = "0d28"
    const KNOWN_PRODUCT_IDS = ["0204", "0209"]
    const KNOWN_MANUFACTURERS = ["mbed", "arm", "microbit"]

    const match = ports.find(port => {
        return (
            port.vendorId?.toLowerCase() === MICROBIT_VENDOR_ID &&
            (KNOWN_PRODUCT_IDS.includes(port.productId?.toLowerCase() || "") ||
                KNOWN_MANUFACTURERS.some(m =>
                    (port.manufacturer || "").toLowerCase().includes(m)
                ))
        )
    })

    if (!match) {
        throw new Error("❌ No micro:bit found.")
    }
    dbgmbit("found micro:bit on %s", match.path)
    const port = new SerialPort({
        path: match.path,
        baudRate: 115200,
    })
    dbgmbit("opening serial port %s", match.path)

    port.on("open", () => {
        dbgmbit("connected")
    })
    port.on("close", () => {
        dbgmbit("disconnected")
    })
    port.on("error", err => {
        dbgmbit("serial port error: %s", err.message)
    })
    port.on("data", data => {
        const msg = data[0]
        if (msg === MCP_TOOL_NAME) {
            const name = msg.toString("utf8", 1).trim()
            dbgmbit(`tool name: %s`, name)
        }
    })
}
