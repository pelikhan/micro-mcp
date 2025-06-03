// serial-stdio.mts
import { SerialPort } from "serialport"
import process from "node:process"

const MICROBIT_VENDOR_ID = "0d28"
const KNOWN_PRODUCT_IDS = ["0204", "0209"]
const KNOWN_MANUFACTURERS = ["mbed", "arm", "microbit"]

async function findMicrobitPort() {
    const ports = await SerialPort.list()

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
    const path = await findMicrobitPort()
    const baudRate = 115200

    let pending = []

    const port = new SerialPort({
        path,
        baudRate,
    })

    // Pipe serial output to stdout
    port.pipe(process.stdout)

    // Pipe stdin to serial input
    process.stdin.setRawMode?.(true) // Optional: raw mode for terminal
    process.stdin.resume()
    process.stdin.pipe(port)

    process.stdin.on("data", data => {
        console.error(
            `${pending ? `caching ` : ``}${data
                .toString("utf8")
                .replace(/\n/g, "")}`
        )
        if (pending) pending.push(data)
        else port.write(data)
        if (data.includes("\x03")) {
            // Ctrl+C
            console.log("\nExiting...")
            port.close(() => process.exit(0))
        }
    })

    port.on("open", () => {
        console.error(`✅ Serial port opened: ${path} @ ${baudRate} baud`)
        if (pending) {
            const p = pending
            pending = undefined
            for (const data of p) {
                console.error(
                    `sending ${data.toString("utf8").replace(/\n/g, "")}`
                )
                port.write(data)
            }
        }
    })

    port.on("error", err => {
        console.error("❌ Serial port error:", err.message)
        process.exit(1)
    })
}

main()
