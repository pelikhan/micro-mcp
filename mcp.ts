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
    method: "tools/list" | "tools/call"
}
interface McpToolCallRequest extends McpRequest {
    method: "tools/call"
    params: {
        name: string
        args: { [index: string]: any }
    }
}

namespace mcp {
    const tools: McpTool[] = []

    function send(msg: any) {
        serial.writeLine(JSON.stringify(msg));
    }

    /**
     * Starts a MCP server with the given tools
     */
    export function startServer() {
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

        notifyToolsListChanged()
    }

    function notifyToolsListChanged() {
        send({
            jsonrpc: "2.0",
            method: "notifications/tools/list_changed"
        });
    }

    function handleToolsList(req: McpRequest) {
        send({
            jsonrpc: "2.0",
            id: req.id,
            result: {
                tools: tools.map(t => ({
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
            const tool = tools.find(t => t.name === name)
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
