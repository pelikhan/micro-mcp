// https://modelcontextprotocol.io/specification/2025-03-26/basic
type McpToolHandler = (args: { [index: string]: any; }) => string | number

interface McpToolDefinition {
    name: string
    description: string
    inputSchema: {
        type: "object",
        properties: { [index: string]: any; }
        required: string[]
    },
    annotations?: {
        title?: string;      // Human-readable title for the tool
        readOnlyHint?: boolean;    // If true, the tool does not modify its environment
        destructiveHint?: boolean; // If true, the tool may perform destructive updates
        idempotentHint?: boolean;  // If true, repeated calls with same args have no additional effect
        openWorldHint?: boolean;   // If true, tool interacts with external entities
    }
}

interface McpTool {
    definition: McpToolDefinition
    handler: McpToolHandler
}

interface McpError {
    code: number;
    message: string;
    data?: any;
}

interface McpMessage {
    jsonrpc: "2.0",
}

interface McpRequest extends McpMessage {
    id: string | number;
    method: string;
    params?: {
        [key: string]: any;
    };
}

interface McpResponse extends McpMessage {
    id?: string | number;
    result?: {
        [key: string]: any;
    }
    error?: McpError
}

interface McpNotification extends McpMessage {
    method: string;
    params?: {
        [key: string]: any;
    };
}

interface McpToolInitializeRequest extends McpRequest {
    method: "initialize"
    params: {
        protocolVersion: string
        capabilities: {
            tools?: {
                supported: boolean
                inputSchemaVersion?: string
            }
        }
        clientInfo?: {
            name: string
            version: string
        }
    }
}

interface McpToolInitializeResponse extends McpResponse {
    result: {
        protocolVersion: string
        capabilities: {
            logging?: {}
            prompts?: {
                listChanged: boolean
            }
            resources?: {
                subscribe: boolean
                listChanged: boolean
            }
            tools?: {
                listChanged: boolean
            }
        }
        serverInfo?: {
            name: string
            version: string
        },
        instructions?: string
    }
}

interface McpToolsListRequest extends McpRequest {
    method: "tools/list"
}

interface McpToolsListResponse extends McpResponse {
    result: {
        tools: McpToolDefinition[]
    }
}

interface McpToolCallRequest extends McpRequest {
    method: "tools/call"
    params?: {
        name: string
        arguments: { [index: string]: any }
    }
}

interface McpToolCallResponse extends McpResponse {
    result: {
        content: { type: "text", text?: string }[]
        isError: boolean
    }
}

enum McpErrorCode {
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603
}

namespace mcp {
    const _tools: McpTool[] = []
    let _started = false
    let _instructions: string
    let ledStatus = false

    function send(msg: McpResponse | McpNotification) {
        serial.writeLine(JSON.stringify(msg));
    }

    function findTool(name: string): McpTool {
        return _tools.find(t => t.definition.name === name)
    }

    /**
     * Registers a tool in the MCP server
     */
    export function tool(ts: McpTool) {
        const existing = findTool(ts.definition.name);
        if (existing)
            _tools[_tools.indexOf(existing)] = ts; // update existing tool
        else
            _tools.push(ts); // add new tool
        notifyToolsListChanged()
    }

    /**
     * Starts a MCP server with the given tools
     */
    export function startServer(instructions?: string) {
        if (_started) return
        ledPlot(0, 0)
        _instructions = instructions
        _started = true
        control.runInBackground(() => serverReadLoop())
    }

    function ledPlot(x: number, y: number) {
        if (ledStatus) led.plot(x, y)
    }

    function ledToggle(x: number, y: number) {
        if (ledStatus) led.toggle(x, y)
    }

    function serverReadLoop() {
        serial.setRxBufferSize(128)
        serial.setTxBufferSize(128)
        let current = ""
        while (true) {
            basic.pause(0)
            ledToggle(0, 1)
            const received = serial.readString()
            ledToggle(1, 1)
            if (received !== "")
                current = current + received
            if (!current || !current.includes("\n")) {
                ledToggle(2, 1)
                continue
            }

            ledToggle(3, 1)
            let req: McpRequest | McpNotification;
            try {
                req = JSON.parse(current)
                ledToggle(4, 1)
            } catch {
                ledToggle(0, 4)
                continue;
            }
            current = ""; // reset for next message

            // Validate JSON-RPC envelope
            if (req === undefined) {
                ledPlot(1, 4)
                send({
                    jsonrpc: "2.0",
                    error: {
                        code: McpErrorCode.InvalidRequest,
                        message: "Invalid JSON-RPC envelope"
                    }
                })
                continue;
            }

            // find tool to run
            switch (req.method) {
                case "initialize": {
                    ledPlot(1, 0)
                    handleInitialize(req as McpToolInitializeRequest);
                    break
                }
                case "notifications/initialized": {
                    ledPlot(1, 2)
                    break
                }
                case "notifications/cancelled": {
                    ledToggle(4, 2)
                    break
                }
                case "tools/list": {
                    ledPlot(3, 0)
                    handleToolsList(req as McpToolsListRequest);
                    break;
                }
                case "tools/call": {
                    ledToggle(4, 0)
                    handleToolCall(req as McpToolCallRequest)
                    break
                }
                default: {
                    send({
                        jsonrpc: "2.0",
                        error: {
                            code: McpErrorCode.MethodNotFound,
                            message: `Method not found: ${req.method}`
                        }
                    })
                    break
                }
            }
        }
    }

    function notifyToolsListChanged() {
        if (!_started) return
        send({
            jsonrpc: "2.0",
            method: "notifications/tools/list_changed"
        });
    }

    function handleInitialize(req: McpToolInitializeRequest) {
        const res: McpToolInitializeResponse = {
            jsonrpc: "2.0",
            id: req.id,
            result: {
                protocolVersion: "2025-03-26",
                capabilities: {
                    tools: {
                        listChanged: true,
                    }
                },
                serverInfo: {
                    name: "BBC micro:bit",
                    version: "1.0.0"
                },
            }
        }
        if (_instructions) {
            res.result.instructions = _instructions;
        }
        send(res);
    }

    function handleToolsList(req: McpRequest) {
        const res: McpToolsListResponse = {
            jsonrpc: "2.0",
            id: req.id,
            result: {
                tools: _tools.map(t => t.definition)
            }
        }
        send(res);
    }

    function handleToolCall(req: McpToolCallRequest) {
        let content: { type: "text", text?: string }[] = []
        let isError: boolean
        try {
            if (!req.params) throw "missing params"

            const { name, arguments } = req.params
            const tool = findTool(name)
            if (!tool) throw "tool not found"

            const res = tool.handler(arguments)
            const text = typeof res === "string" ? res : "" + res
            content.push({ type: "text", text })
            isError = false
        } catch (e) {
            content.push({ type: "text", text: "" + e })
            isError = true
        }
        const res: McpToolCallResponse = {
            jsonrpc: "2.0",
            id: req.id,
            result: { content, isError },
        }
        send(res);
    }
}
