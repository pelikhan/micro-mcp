interface McpTool {
    name: string
    description: string
    inputSchema: {
        type: "object",
        properties: { [index: string]: any; }
        required: string[]
    }
    handler: (args: { [index: string]: any; }) => string
}
interface McpRequest {
    jsonrpc: "2.0"
    id: string
    method: "initialize" | "tools/list" | "tools/call"
}

interface McpToolInitializeRequest extends McpRequest {
    method: "initialize"
}

interface McpToolCallRequest extends McpRequest {
    method: "tools/call"
    params: {
        name: string
        args: { [index: string]: any }
    }
}

namespace mcp {
    const _tools: McpTool[] = []
    let started = false

    function send(msg: any) {
        serial.writeLine(JSON.stringify(msg));
    }

    function findTool(name: string): McpTool {
        return _tools.find(t => t.name === name)
    }

    /**
     * Registers a tool in the MCP server
     */
    export function registerTools(ts: McpTool[]) {
        if (!ts || !ts.length) return

        let changed = false
        for (const t of ts) {
            if (!findTool(t.name)) {
                _tools.push(t)
                changed = true
            }
        }
        if (changed)
            notifyToolsListChanged()
    }

    /**
     * Starts a MCP server with the given tools
     */
    export function startServer(ts?: McpTool[]) {
        serial.onDataReceived(serial.delimiters(Delimiters.NewLine), () => {
            const raw = serial.readLine().trim();
            if (!raw) return;

            let req: McpRequest;
            try {
                req = JSON.parse(raw);
            } catch {
                // malformed JSON – ignore
                return;
            }

            // Validate JSON-RPC envelope
            if (!req || req.jsonrpc !== "2.0" || typeof req.id === "undefined") return;

            // find tool to run
            switch (req.method) {
                case "initialize": {
                    handleInitialize(req as McpToolInitializeRequest);
                    break
                }
                case "tools/list": {
                    handleToolsList(req)
                    break;
                }
                case "tools/call": {
                    handleToolCall(req as McpToolCallRequest)
                    break
                }
            }
        });

        started = true
        registerTools(ts)
    }

    function notifyToolsListChanged() {
        if (!started) return
        send({
            jsonrpc: "2.0",
            method: "notifications/tools/list_changed"
        });
    }

    function handleInitialize(req: McpToolInitializeRequest) {
        send({
            jsonrpc: "2.0",
            id: req.id,
            result: {
                capabilities: {
                    tools: {
                        supported: true,
                        inputSchemaVersion: "1.0"
                    }
                }
            }
        });
    }

    function handleToolsList(req: McpRequest) {
        send({
            jsonrpc: "2.0",
            id: req.id,
            result: {
                tools: _tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema
                }))
            }
        });
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
        send({
            jsonrpc: "2.0",
            id: req.id,
            result: { content, isError },
        });
    }
}
