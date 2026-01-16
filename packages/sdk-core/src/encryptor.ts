/**
 * Encryptor handles the secrets that used for encrypting game data.
 *
 * The public keys and secrets can be packaged and exported as NodeKeys.
 */

import { SdkError } from './error'
import { Secret, Ciphertext } from './types'
import { field } from '@race-foundation/borsh'
import { base64ToArrayBuffer, arrayBufferToBase64 } from './utils'
import { Chacha20 } from 'ts-chacha20'
import { subtle } from './crypto'
import { IStorage } from './storage'
import { Credentials } from './credentials'

export const aesContentIv = Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)

export const chacha20Nonce = Uint8Array.of(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)

export const aesDigestIv = Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1)

const textDecoder = new TextDecoder('utf8')

const publicExponent = Uint8Array.of(1, 0, 1)

export interface INodePrivateKey {
    rsa: CryptoKeyPair
    ec: CryptoKeyPair
}

export interface INodePublicKey {
    rsa: CryptoKey
    ec: CryptoKey
}

export interface IPublicKeyRaws {
    rsa: string
    ec: string
}

export class PublicKeyRaws {
    @field('string')
    rsa: string
    @field('string')
    ec: string
    constructor(fields: IPublicKeyRaws) {
        this.rsa = fields.rsa
        this.ec = fields.ec
    }
}

export type EncryptorExportedKeys = {
    playerAddr: string
    ec: [string, string]
    rsa: [string, string]
}

const RSA_PARAMS = {
    name: 'RSA-OAEP',
    hash: 'SHA-256',
}

const EC_PARAMS = {
    name: 'ECDSA',
    namedCurve: 'P-256',
}

export async function exportRsaPublicKey(publicKey: CryptoKey): Promise<string> {
    return arrayBufferToBase64(await subtle().exportKey('spki', publicKey))
}

export async function exportEcPublicKey(publicKey: CryptoKey): Promise<string> {
    return arrayBufferToBase64(await subtle().exportKey('spki', publicKey))
}

export async function exportAes(key: CryptoKey): Promise<Uint8Array> {
    return new Uint8Array(await subtle().exportKey('raw', key))
}

export async function exportRsa(keypair: CryptoKeyPair): Promise<[string, string]> {
    let privkey = await subtle().exportKey('pkcs8', keypair.privateKey)
    return [arrayBufferToBase64(privkey), await exportRsaPublicKey(keypair.publicKey)]
}

export async function exportEc(keypair: CryptoKeyPair): Promise<[string, string]> {
    let privkey = await subtle().exportKey('pkcs8', keypair.privateKey)
    return [arrayBufferToBase64(privkey), await exportEcPublicKey(keypair.publicKey)]
}

export async function encryptRsa(publicKey: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await subtle().encrypt('RSA-OAEP', publicKey, plaintext))
}

export async function decryptRsa(privateKey: CryptoKey, ciphertext: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await subtle().decrypt('RSA-OAEP', privateKey, ciphertext))
}

export async function signEc(privateKey: CryptoKey, message: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, privateKey, message))
}

export async function verifyEc(publicKey: CryptoKey, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
    return await subtle().verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, publicKey, signature, message)
}

export function encryptChacha20(key: Uint8Array, text: Uint8Array, nonce: Uint8Array): Uint8Array {
    return new Chacha20(key, nonce).encrypt(text)
}

export function decryptChacha20(key: Uint8Array, text: Uint8Array, nonce: Uint8Array): Uint8Array {
    return new Chacha20(key, nonce).decrypt(text)
}

export async function encryptAes(key: CryptoKey, text: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(
        await subtle().encrypt(
            {
                name: 'AES-CTR',
                counter: iv,
                length: 64,
            },
            key,
            text
        )
    )
}

export async function decryptAes(key: CryptoKey, text: Ciphertext, iv: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(
        await subtle().decrypt(
            {
                name: 'AES-CTR',
                counter: iv,
                length: 64,
            },
            key,
            text
        )
    )
}

export async function importAes(rawKey: Uint8Array): Promise<CryptoKey> {
    return await subtle().importKey('raw', rawKey, { name: 'AES-CTR' }, true, ['encrypt', 'decrypt'])
}

export async function importRsa([privateKeyStr, publicKeyStr]: [string, string]): Promise<CryptoKeyPair> {
    const privateBuf = base64ToArrayBuffer(privateKeyStr)
    const privateKey = await subtle().importKey('pkcs8', privateBuf, RSA_PARAMS, true, ['decrypt'])
    const publicKey = await importRsaPublicKey(publicKeyStr)
    return { publicKey, privateKey }
}

export async function importEc([privateKeyStr, publicKeyStr]: [string, string]): Promise<CryptoKeyPair> {
    const privateBuf = base64ToArrayBuffer(privateKeyStr)
    const privateKey = await subtle().importKey('pkcs8', privateBuf, EC_PARAMS, true, ['sign'])
    const publicKey = await importEcPublicKey(publicKeyStr)
    return { publicKey, privateKey }
}

export async function importRsaPublicKey(publicKeyStr: string): Promise<CryptoKey> {
    const publicBuf = base64ToArrayBuffer(publicKeyStr)
    const publicKey = await subtle().importKey('spki', publicBuf, RSA_PARAMS, true, ['encrypt'])
    return publicKey
}

export async function importEcPublicKey(publicKeyStr: string): Promise<CryptoKey> {
    const publicBuf = base64ToArrayBuffer(publicKeyStr)
    const publicKey = await subtle().importKey('spki', publicBuf, EC_PARAMS, true, ['verify'])
    return publicKey
}

export async function generateEcKeypair(): Promise<CryptoKeyPair> {
    return await subtle().generateKey(EC_PARAMS, true, ['verify', 'sign'])
}

export async function generateRsaKeypair(): Promise<CryptoKeyPair> {
    return await subtle().generateKey(
        {
            name: 'RSA-OAEP',
            modulusLength: 1024,
            publicExponent: publicExponent,
            hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
    )
}


export function generateChacha20(): Uint8Array {
    const arr = new Uint8Array(32)
    crypto.getRandomValues(arr)
    return arr
}

export async function generateAes(): Promise<CryptoKey> {
    const k = await subtle().generateKey(
        {
            name: 'AES-CTR',
            length: 128,
        },
        true,
        ['encrypt', 'decrypt']
    )
    return k
}

export interface ISignature {
    signer: string
    timestamp: bigint
    signature: Uint8Array
}

export class Signature {
    @field('string')
    signer: string
    @field('u64')
    timestamp: bigint
    @field('u8-array')
    signature: Uint8Array

    constructor(fields: ISignature) {
        this.signer = fields.signer
        this.timestamp = fields.timestamp
        this.signature = fields.signature
    }
}

async function deriveKey(origin: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
    const rawKey = await crypto.subtle.importKey(
        'raw',
        origin,
        { name: 'PBKDF2' },
        false,
        [ 'deriveKey' ],
    )

    const derivedKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: new Uint8Array(salt),
            iterations: 100000,
            hash: 'SHA-256',
        },
        rawKey,
        { name: 'AES-GCM', length: 256 },
        true,
        [ 'encrypt', 'decrypt' ]
    )

    return derivedKey
}

/**
 * Generate a new credentials.
 *
 * @param originalSecret a signature signed by user's wallet
 */
export async function generateCredentials(originalSecret: Uint8Array): Promise<Credentials> {
    // Generate the keys
    const rsaKeypair = await generateRsaKeypair()
    const ecKeypair = await generateEcKeypair()

    // Use X25519 to derive a key from originalSecret.
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const derivedKey = await deriveKey(originalSecret, salt)

    const iv = crypto.getRandomValues(new Uint8Array(12))

    const ecPublic = await subtle().exportKey('spki', ecKeypair.publicKey)
    const rsaPublic = await subtle().exportKey('spki', rsaKeypair.publicKey)

    const ecPrivate = await subtle().exportKey('pkcs8', ecKeypair.privateKey)
    const rsaPrivate = await subtle().exportKey('pkcs8', rsaKeypair.privateKey)

    const ecPrivateEnc = await subtle().encrypt(
        {
            name: 'AES-GCM',
            iv,
        },
        derivedKey,
        ecPrivate,
    )
    const rsaPrivateEnc = await subtle().encrypt(
        {
            name: 'AES-GCM',
            iv,
        },
        derivedKey,
        rsaPrivate,
    )

    return new Credentials({
        ecPublic: new Uint8Array(ecPublic),
        rsaPublic: new Uint8Array(rsaPublic),
        salt,
        iv,
        ecPrivateEnc: new Uint8Array(ecPrivateEnc),
        rsaPrivateEnc: new Uint8Array(rsaPrivateEnc),
    })
}



/**
 * Encryptor
 * Use RSA and ChaCha20(AES-CTR) for random secrets encryption.
 */

export interface IEncryptor {
    /**
     * Import a credentials of current node.
     */
    importCredentials(originalSecret: Uint8Array, addr: string, credentials: Credentials): Promise<void>

    /**
     * Import a credentials with only its public part.
     */
    importPublicCredentials(addr: string, credentials: Credentials): Promise<void>

    // addPublicKey(addr: string, pubkeys: IPublicKeyRaws): Promise<void>

    // exportPublicKey(addr?: string): Promise<IPublicKeyRaws>

    decryptRsa(text: Uint8Array): Promise<Uint8Array>

    decryptAes(secret: Secret, text: Ciphertext): Promise<Ciphertext>

    decryptAesMulti(secrets: Secret[], text: Ciphertext): Promise<Ciphertext>

    encryptChacha20(secret: Secret, text: Ciphertext): Ciphertext

    decryptChacha20(secret: Secret, text: Ciphertext): Ciphertext

    sign(message: Uint8Array, signer: string): Promise<Signature>

    verify(message: Uint8Array, signature: Signature): Promise<boolean>

    decryptWithSecrets(
        ciphertextMap: Map<number, Ciphertext>,
        secretMap: Map<number, Secret[]>,
        validOptions: string[]
    ): Promise<Map<number, string>>
}

class NodePrivateKey implements INodePrivateKey {
    rsa: CryptoKeyPair
    ec: CryptoKeyPair

    constructor(rsa: CryptoKeyPair, ec: CryptoKeyPair) {
        this.rsa = rsa
        this.ec = ec
    }

    static async initialize(keys?: { rsa?: CryptoKeyPair; ec?: CryptoKeyPair }): Promise<NodePrivateKey> {
        let rsa, ec
        if (keys?.rsa === undefined) {
            rsa = await generateRsaKeypair()
        } else {
            rsa = keys.rsa
        }
        if (keys?.ec === undefined) {
            ec = await generateEcKeypair()
        } else {
            ec = keys.ec
        }
        return new NodePrivateKey(rsa, ec)
    }
}

class NodePublicKey implements INodePublicKey {
    rsa: CryptoKey
    ec: CryptoKey

    constructor(rsa: CryptoKey, ec: CryptoKey) {
        this.rsa = rsa
        this.ec = ec
    }
}

export class Encryptor implements IEncryptor {
    #privateKey: INodePrivateKey | undefined
    #publicKeys: Map<string, INodePublicKey>

    constructor() {
        this.#privateKey = undefined
        this.#publicKeys = new Map()
    }

    async importCredentials(originalSecret: Uint8Array, addr: string, credentials: Credentials): Promise<void> {

        console.debug(`Import credentials for node: ${addr}`)

        const {
            ecPublic, rsaPublic, salt, iv, ecPrivateEnc, rsaPrivateEnc,
        } = credentials

        const derivedKey = await deriveKey(originalSecret, salt)

        const ecPrivate = await subtle().decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
            },
            derivedKey,
            ecPrivateEnc,
        );

        const rsaPrivate = await subtle().decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
            },
            derivedKey,
            rsaPrivateEnc,
        );

        const ecPrivateKey = await subtle().importKey('pkcs8', ecPrivate, EC_PARAMS, true, ['sign'])
        const ecPublicKey = await subtle().importKey('spki', ecPublic, EC_PARAMS, true, ['verify'])
        const rsaPrivateKey = await subtle().importKey('pkcs8', rsaPrivate, RSA_PARAMS, true, ['decrypt'])
        const rsaPublicKey = await subtle().importKey('spki', rsaPublic, RSA_PARAMS, true, ['encrypt'])

        console.debug(`Import credentials succeed: ${addr}`)

        this.#privateKey = {
            rsa: { privateKey: rsaPrivateKey, publicKey: rsaPublicKey },
            ec: { privateKey: ecPrivateKey, publicKey: ecPublicKey },
        }
    }

    async importPublicCredentials(addr: string, credentials: Credentials): Promise<void> {
        console.debug(`Import public credentials for node: ${addr}`)
        console.debug('Credentials:', credentials)

        const {
            ecPublic, rsaPublic,
        } = credentials

        const ecPublicKey = await subtle().importKey('spki', ecPublic, EC_PARAMS, true, ['verify'])
        const rsaPublicKey = await subtle().importKey('spki', rsaPublic, RSA_PARAMS, true, ['encrypt'])

        console.debug(`Import public credentials succeed: ${addr}`)

        this.#publicKeys.set(addr, {
            rsa: rsaPublicKey,
            ec: ecPublicKey,
        })
    }

    async decryptRsa(text: Uint8Array): Promise<Uint8Array> {
        if (!this.#privateKey) throw new Error('No credential available for RSA decryption')
        return await decryptRsa(this.#privateKey.rsa.privateKey, text)
    }

    async decryptAes(secret: Secret, text: Ciphertext): Promise<Ciphertext> {
        const key = await importAes(secret)
        return await decryptAes(key, text, aesContentIv)
    }

    async decryptAesMulti(secrets: Secret[], text: Ciphertext): Promise<Ciphertext> {
        for (const secret of secrets) {
            text = await this.decryptAes(secret, text)
        }
        return text
    }

    encryptChacha20(secret: Secret, text: Ciphertext): Ciphertext {
        return encryptChacha20(secret, text, chacha20Nonce)
    }

    decryptChacha20(secret: Secret, text: Ciphertext): Ciphertext {
        return decryptChacha20(secret, text, chacha20Nonce)
    }

    decryptChacha20Multi(secrets: Secret[], text: Ciphertext): Ciphertext {
        for (const secret of secrets) {
            text = this.decryptChacha20(secret, text)
        }
        return text
    }

    async signRaw(message: Uint8Array): Promise<Uint8Array> {
        if (!this.#privateKey) throw new Error('No credential available for EC sign')
        return await signEc(this.#privateKey.ec.privateKey, message)
    }

    makeSignMessage(message: Uint8Array, timestamp: bigint): Uint8Array {
        const timestampView = new DataView(new ArrayBuffer(8))
        timestampView.setBigUint64(0, timestamp, true)
        const buf = new Uint8Array(message.length + 8)
        buf.set(message)
        buf.set(new Uint8Array(timestampView.buffer), message.length)
        return buf
    }

    async sign(message: Uint8Array, signer: string): Promise<Signature> {
        const timestamp = BigInt(new Date().getTime())
        const buf = this.makeSignMessage(message, timestamp)

        console.info("XXX, message:", buf)
        console.info("XXX, timestamp:", timestamp)
        console.info("XXX, public keys:", this.#publicKeys)

        const signature = await this.signRaw(buf)
        console.info("XXX, signature:", signature)
        return new Signature({
            timestamp,
            signer,
            signature,
        })
    }

    async verify(message: Uint8Array, signature: Signature): Promise<boolean> {
        const timestamp = signature.timestamp
        const ecPublicKey = this.#publicKeys.get(signature.signer)?.ec
        if (ecPublicKey === undefined) {
            throw new Error("Can't verify message, ECDSA key is missing")
        }
        const buf = this.makeSignMessage(message, timestamp)
        return await verifyEc(ecPublicKey, signature.signature, buf)
    }

    async addPublicKey(addr: string, { rsa, ec }: IPublicKeyRaws): Promise<void> {
        const rsa_ = await importRsaPublicKey(rsa)
        const ec_ = await importEcPublicKey(ec)
        this.#publicKeys.set(addr, new NodePublicKey(rsa_, ec_))
    }

    /**
     * Decrypt the cipertext with given secrets.
     *
     * @param ciphertextMap The mapping from item index to ciphertext.
     * @param secretMap The mapping from item index to a list of secrets for decryption.
     * @param validOptions The expected output of decryption. The decryption fails when it doesn't meet a valid option.
     *
     * @return The result of decryption, a mapping from item inedx to plain item content.
     */
    async decryptWithSecrets(
        ciphertextMap: Map<number, Ciphertext>,
        secretMap: Map<number, Secret[]>,
        validOptions: string[]
    ): Promise<Map<number, string>> {
        const res = new Map()
        for (const [idx, ciphertext] of ciphertextMap) {
            const secrets = secretMap.get(idx)

            console.info('Ciphertext:', ciphertext)
            console.info('Secrets: ', secrets)

            if (secrets === undefined) {
                throw new Error('Missing secrets')
            } else {
                const decrypted = this.decryptChacha20Multi(secrets, ciphertext)
                const decryptedValue = textDecoder.decode(decrypted)
                if (validOptions.find(s => s === decryptedValue) === undefined) {
                    throw new Error('Invalid result: [' + decryptedValue + '], options:' + validOptions.join(','))
                }
                res.set(idx, decryptedValue)
            }
        }
        return res
    }
}
