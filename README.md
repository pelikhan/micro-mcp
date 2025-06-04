# micro-mcp
## Turn your BBC micro:bit into a [Model Context Protocol](https://modelcontextprotocol.io/introduction) (MCP) server

With this library, you will be able to define MCP tools in TypeScript (blocks not yet)
and use the bridge script to connect to a MCP client via stdio.

https://github.com/user-attachments/assets/48418354-385a-45e9-bee1-7e36633dd243

## Example

This example shows how to define a tool that displays a number on the micro:bit's LED matrix.

```ts
mcp.tool({
    definition: {
        name: "show_number",
        description: "Show a number on the 5 x 5 LED matrix",
        inputSchema: {
            type: "object",
            properties: {
                number: { type: "integer", description: "Integer to show" }
            },
            required: ["number"]
        },
        annotations: {
            title: "Show Number",
            idempotentHint: true,
        }
    },
    handler: (args: { number: number }) => {
        const number = args.number || 0;
        basic.showNumber(number);
        return `ok`;
    }
})
mcp.startServer()
```

## Visual Studio Code

To test out the MCP server, you can use the `bridge` script in this repository.

- create a `.vscode/mcp.json` file in the root of this repository with the following content:

```json
{
    "servers": {
        "micro-mcp": {
            "type": "stdio",
            "command": "node",
            "args": ["${workspaceFolder}/bridge.mjs"]
        }
    }
}
```

- open GitHub Copilot Chat
- open the `mcp.json` file and start the server
- click on the `Tools` icon and make sure your tool are listed and selected
- prompt away!

## Use as Extension

This repository can be added as an **extension** in MakeCode.

* open [https://makecode.microbit.org/](https://makecode.microbit.org/)
* click on **New Project**
* click on **Extensions** under the gearwheel menu
* search for **https://github.com/pelikhan/micro-mcp** and import

## Edit this project

Use Visual Studio Code to edit this project.

#### Metadata (used for search, rendering)

* for PXT/microbit

![ChatGPT Image Jun 4, 2025, 02_22_06 PM](https://github.com/user-attachments/assets/b1445cad-2a9a-4dfd-be80-551c72399be4)
