// https://modelcontextprotocol.io/specification/2025-03-26/basic
type McpToolHandler = (args: { [index: string]: any; }) => string

interface McpToolDefinition {
    name: string
    description: string
    inputSchema: {
        type: "object",
        properties: { [index: string]: any; }
        required: string[]
    }
}

interface McpTool extends McpToolDefinition {
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
    id: string | number;
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
        args: { [index: string]: any }
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
    let ledStatus = true

    function send(msg: McpResponse | McpNotification) {
        serial.writeLine(JSON.stringify(msg));
    }

    function findTool(name: string): McpTool {
        return _tools.find(t => t.name === name)
    }

    /**
     * Registers a tool in the MCP server
     */
    export function tool(ts: McpTool) {
        const existing = _tools.find(t => t.name === ts.name);
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
        if (ledStatus) led.plot(0, 0)
        _instructions = instructions
        serial.setRxBufferSize(128);
        serial.setTxBufferSize(128);
        const newLine = serial.delimiters(Delimiters.NewLine)
        serial.onDataReceived(newLine, () => {
            if (ledStatus) led.toggle(0, 1)
            const raw = serial.readString()
            if (ledStatus) led.toggle(1, 1)
            if (!raw) return;
            if (ledStatus) led.toggle(2, 1)

            let req: McpRequest | McpNotification;
            try {
                if (raw.indexOf("\"method\":\"initialize\"") > 0)
                    req = { method: "initialize", jsonrpc: "2.0", id: 1 } as McpToolInitializeRequest;
                else
                    req = JSON.parse(raw) as any
            } catch {
                led.toggle(0, 4)
                send({
                    jsonrpc: "2.0",
                    id: 1,
                    error: {
                        code: McpErrorCode.ParseError,
                        message: "Invalid JSON format"
                    }
                })
                return;
            }
            if (ledStatus) led.toggle(3, 1)

            // Validate JSON-RPC envelope
            if (!req) {
                led.toggle(1, 4)
                send({
                    jsonrpc: "2.0",
                    id: 1,
                    error: {
                        code: McpErrorCode.InvalidRequest,
                        message: "Invalid JSON-RPC envelope"
                    }
                })
                return;
            }
            if (ledStatus) led.toggle(4, 1)

            // find tool to run
            switch (req.method) {
                case "initialize": {
                    if (ledStatus) led.plot(1, 0)
                    handleInitialize(req as McpToolInitializeRequest);
                    break
                }
                case "notifications/initialized": {
                    if (ledStatus) led.plot(2, 0)
                    break
                }
                case "tools/list": {
                    if (ledStatus) led.plot(3, 0)
                    handleToolsList(req as McpToolsListRequest);
                    break;
                }
                case "tools/call": {
                    if (ledStatus) led.toggle(4, 0)
                    handleToolCall(req as McpToolCallRequest)
                    break
                }
                default: {
                    led.toggle(2, 4)
                    break
                }
            }
        });

        _started = true
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
                tools: _tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema
                } as McpToolDefinition))
            }
        }
        send(res);
    }

    function handleToolCall(req: McpToolCallRequest) {
        let content: { type: "text", text?: string }[] = []
        let isError: boolean
        try {
            if (!req.params) throw "missing params"

            const { name, args } = req.params
            const tool = findTool(name)
            if (!tool) throw "tool not found"

            const text = tool.handler(args)
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
