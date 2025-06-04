// serial-stdio.mts
import { SerialPort } from "serialport"
import process from "node:process"
import { promisify } from "node:util"

async function findMicrobitPort() {
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

    console.error(`✅ Found micro:bit on ${match.path}`)
    return match.path
}

async function main() {
    const portPath = await findMicrobitPort()
    let pending = []

    const port = new SerialPort({
        path: portPath,
        baudRate: 115200,
    })

    const drain = promisify(cb => port.drain(cb))
    // Pipe serial output to stdout
    port.pipe(process.stdout)

    // Pipe stdin to serial input
    process.stdin.setRawMode?.(true) // Optional: raw mode for terminal
    process.stdin.resume()

    const send = async data => {
        if (pending) {
            pending.push(data)
        } else {
            console.error(`📤 send: ${data.toString()}`)
            port.write(data)
            await drain()
        }
    }

    process.stdin.on("data", async data => {
        if (data.includes("\x03")) {
            // Ctrl+C
            console.log("\nExiting...")
            port.close(() => process.exit(0))
        }
        await send(data)
    })

    port.on("open", async () => {
        console.error(`✅ micro:bit connected: ${portPath}`)
        if (pending) {
            const ps = pending
            pending = undefined
            for (const p of ps) await send(p)
        }
    })

    port.on("error", err => {
        console.error("❌ micro:bit error:", err.message)
        process.exit(1)
    })
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

main()
