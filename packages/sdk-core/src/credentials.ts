import { field, serialize, deserialize } from '@race-foundation/borsh'
import { Fields } from './types'
import { hexToBuffer } from './utils'

export const CREDENTIALS_MESSAGE = hexToBuffer('This message is required as credentials for gameplay.')

/**
 * The credentials for game play.
 *
 * EC (ED25519) keypair is used to sign and verify the message.
 * It prevents forged sender.
 *
 * RSA keypair is used to encrypt and decrypt message.
 * It ensures the security of bilateral message (sharing secrets).
 *
 * Private keys in this structure are encrypted with AES, which is
 * derived with a wallet-signed message and salt.
 */
export class Credentials {
    @field('u8-array')
    ecPublic!: Uint8Array
    @field('u8-array')
    rsaPublic!: Uint8Array
    @field('u8-array')
    salt!: Uint8Array
    @field('u8-array')
    iv!: Uint8Array
    @field('u8-array')
    ecPrivateEnc!: Uint8Array
    @field('u8-array')
    rsaPrivateEnc!: Uint8Array

    constructor(fields: Fields<Credentials>) {
        Object.assign(this, fields)
    }

    static deserialize(data: Uint8Array): Credentials {
        return deserialize(Credentials, data)
    }

    serialize(): Uint8Array {
        return serialize(this)
    }
}
