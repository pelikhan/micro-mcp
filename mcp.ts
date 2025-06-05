// https://modelcontextprotocol.io/specification/2025-03-26/basic

interface McpResourceDefinition {
    uri: string // Unique identifier for the resource
    name: string // Human-readable name
    description?: string // Optional description
    mimeType?: string // Optional MIME type
    size?: number // Optional size in bytes
}

interface McpResource {
    definition: McpResourceDefinition
    handler: () => string | number | boolean
}

interface McpToolDefinition {
    name: string
    description: string
    inputSchema: {
        type: "object"
        properties: { [index: string]: any }
        required: string[]
    }
    annotations?: {
        title?: string // Human-readable title for the tool
        readOnlyHint?: boolean // If true, the tool does not modify its environment
        destructiveHint?: boolean // If true, the tool may perform destructive updates
        idempotentHint?: boolean // If true, repeated calls with same args have no additional effect
        openWorldHint?: boolean // If true, tool interacts with external entities
    }
}

type McpToolHandler = (args: {
    [index: string]: any
}) => string | number | boolean

interface McpTool {
    definition: McpToolDefinition
    handler: McpToolHandler
}

interface McpError {
    code: number
    message: string
    data?: any
}

interface McpMessage {
    jsonrpc: "2.0"
}

interface McpRequest extends McpMessage {
    id: string | number
    method: string
    params?: {
        [key: string]: any
    }
}

interface McpResponse extends McpMessage {
    id?: string | number
    result?: {
        [key: string]: any
    }
    error?: McpError
}

interface McpNotification extends McpMessage {
    method: string
    params?: {
        [key: string]: any
    }
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
            resources?: {
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
        }
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

interface McpResourcesListRequest extends McpRequest {
    method: "resources/list"
}

interface McpResourcesListResponse extends McpResponse {
    result: {
        resources: McpResourceDefinition[]
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
        content: { type: "text"; text?: string }[]
        isError: boolean
    }
}

interface McpResourceReadRequest extends McpRequest {
    method: "resources/read"
    params: {
        uri: string
    }
}

interface McpResourceReadResponse extends McpResponse {
    result: {
        content: {
            uri: string // The URI of the resource
            mimeType?: string // Optional MIME type
            text?: string // For text resources
        }[]
    }
}

enum McpErrorCode {
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
}

namespace mcp {
    const _tools: McpTool[] = []
    const _resources: McpResource[] = []

    let _started = false
    let _instructions: string

    function send(msg: McpResponse | McpNotification) {
        serial.writeLine(JSON.stringify(msg))
    }

    function findTool(name: string): McpTool {
        return _tools.find(t => t.definition.name === name)
    }

    function findResource(uri: string): McpResource {
        return _resources.find(t => t.definition.uri === uri)
    }

    /**
     * Registers a tool in the MCP server
     */
    export function tool(ts: McpTool) {
        const existing = findTool(ts.definition.name)
        if (existing)
            _tools[_tools.indexOf(existing)] = ts // update existing tool
        else _tools.push(ts) // add new tool
        notifyToolsListChanged()
    }

    /**
     * Registers a resource in the MCP server
     */
    export function resource(ts: McpResource) {
        if (!ts.definition.uri.includes("://"))
            ts.definition.uri = "microbit://" + ts.definition.uri // ensure URI starts with micro://
        const existing = findResource(ts.definition.uri)
        if (existing) _resources[_resources.indexOf(existing)] = ts
        // update existing resource
        else _resources.push(ts) // add new resource
        notifyResourcesListChanged()
    }

    /**
     * Starts a MCP server with the given tools
     */
    export function startServer(instructions?: string) {
        if (_started) return
        _instructions = instructions
        _started = true
        control.runInBackground(() => serverReadLoop())
    }

    function serverReadLoop() {
        serial.setRxBufferSize(128)
        serial.setTxBufferSize(128)
        let current = ""
        while (true) {
            basic.pause(0)
            const received = serial.readString()
            if (received !== "") current = current + received
            if (!current || !current.includes("\n")) {
                continue
            }

            let req: McpRequest | McpNotification
            try {
                req = JSON.parse(current)
            } catch {
                continue
            }
            current = "" // reset for next message

            // Validate JSON-RPC envelope
            if (req === undefined) {
                send({
                    jsonrpc: "2.0",
                    error: {
                        code: McpErrorCode.InvalidRequest,
                        message: "Invalid JSON-RPC envelope",
                    },
                })
                continue
            }

            // find tool to run
            switch (req.method) {
                case "initialize": {
                    handleInitialize(req as McpToolInitializeRequest)
                    break
                }
                case "notifications/initialized": {
                    notifyToolsListChanged()
                    break
                }
                case "notifications/cancelled": {
                    break
                }
                case "tools/list": {
                    handleToolsList(req as McpToolsListRequest)
                    break
                }
                case "tools/call": {
                    handleToolCall(req as McpToolCallRequest)
                    break
                }
                case "resources/list": {
                    handleResourcesList(req as McpResourcesListRequest)
                    break
                }
                case "resources/read": {
                    handleResourceRead(req as McpResourceReadRequest)
                    break
                }
                default: {
                    send({
                        jsonrpc: "2.0",
                        error: {
                            code: McpErrorCode.MethodNotFound,
                            message: `Method not found: ${req.method}`,
                        },
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
            method: "notifications/tools/list_changed",
        })
    }

    function notifyResourcesListChanged() {
        if (!_started) return
        send({
            jsonrpc: "2.0",
            method: "notifications/resources/list_changed",
        })
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
                    },
                    resources: {
                        subscribe: false,
                        listChanged: true,
                    },
                },
                serverInfo: {
                    name: "BBC micro:bit",
                    version: "1.0.0",
                },
            },
        }
        if (_instructions) {
            res.result.instructions = _instructions
        }
        send(res)
    }

    function handleToolsList(req: McpToolsListRequest) {
        const res: McpToolsListResponse = {
            jsonrpc: "2.0",
            id: req.id,
            result: {
                tools: _tools.map(t => t.definition),
            },
        }
        send(res)
    }

    function handleResourcesList(req: McpResourcesListRequest) {
        const res: McpResourcesListResponse = {
            jsonrpc: "2.0",
            id: req.id,
            result: {
                resources: _resources.map(r => r.definition),
            },
        }
        send(res)
    }

    function handleResourceRead(req: McpResourceReadRequest) {
        const content: McpResourceReadResponse["result"]["content"] = []
        try {
            if (!req.params) throw "missing params"

            const resource = findResource(req.params.uri)
            if (!resource) throw "resource not found"

            const res = resource.handler()
            const text = typeof res === "string" ? res : "" + res
            content.push({ uri: req.params.uri, text })
        } catch (e) {
            content.push({ uri: req.params.uri, text: "" + e })
        }
        const res: McpResourceReadResponse = {
            jsonrpc: "2.0",
            id: req.id,
            result: { content },
        }
        send(res)
    }

    function handleToolCall(req: McpToolCallRequest) {
        const content: { type: "text"; text?: string }[] = []
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
        send(res)
    }
}
