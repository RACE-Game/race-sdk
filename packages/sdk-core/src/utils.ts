const subtle = globalThis.crypto.subtle

export function hexToBuffer(hex: string): Uint8Array<ArrayBuffer> {
    return new Uint8Array((hex.match(/[\da-f]{2}/gi) || []).map(function(h) {
        return parseInt(h, 16);
    }));
}

export async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    let hashBuffer = await subtle.digest('SHA-256', data)
    return new Uint8Array(hashBuffer)
}

export async function sha256String(data: Uint8Array<ArrayBuffer>): Promise<string> {
    return Array.from(await sha256(data))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
}

export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
    let binary = ''
    let bytes = new Uint8Array(buffer)
    let len = bytes.byteLength
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const rawBytes = atob(base64)
    const uint8Array = new Uint8Array(rawBytes.length)
    for (let i = 0; i < rawBytes.length; i++) {
        uint8Array[i] = rawBytes.charCodeAt(i)
    }
    return uint8Array.buffer
}

export function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const rawBytes = atob(base64)
    const uint8Array = new Uint8Array(rawBytes.length)
    for (let i = 0; i < rawBytes.length; i++) {
        uint8Array[i] = rawBytes.charCodeAt(i)
    }
    return uint8Array
}
