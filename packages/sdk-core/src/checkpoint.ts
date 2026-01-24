import { array, deserialize, serialize, field, map, option, struct, enums } from '@race-foundation/borsh'
import { sha256 } from './utils'
import { Fields } from './types'
import { GameEvent } from './events'
import { EmitBridgeEvent, LaunchSubGame, PlayerBalance } from './effect'
import { SharedData } from './shared-data'
import { VersionedData } from './versioned-data'
import { GameSpec } from './game-spec'
import { Versions } from './versions'
import { Node, INodeStatus } from './node'
import { ClientMode } from './client-mode'

export class CheckpointOnChain {
    @field('u8-array')
    root!: Uint8Array

    @field('usize')
    size!: number

    @field('u64')
    accessVersion!: bigint

    constructor(fields: any) {
        Object.assign(this, fields)
    }

    static fromRaw(raw: Uint8Array): CheckpointOnChain {
        return deserialize(CheckpointOnChain, raw)
    }
}

export class CheckpointOffChain {
    @field(struct(VersionedData))
    rootData!: VersionedData

    @field(struct(SharedData))
    sharedData!: SharedData

    @field(array('u8-array'))
    proofs!: Uint8Array[]

    constructor(fields: any) {
        Object.assign(this, fields)
    }

    static deserialize(raw: Uint8Array): CheckpointOffChain {
        return deserialize(CheckpointOffChain, raw)
    }
}

export class CheckpointOffChainOrNull {
    @field(option(struct(CheckpointOffChain)))
    checkpoint!: CheckpointOffChain | undefined

    constructor(fields: any) {
        Object.assign(this, fields)
    }

    static deserialize(raw: Uint8Array): CheckpointOffChainOrNull {
        return deserialize(CheckpointOffChainOrNull, raw)
    }
}

export class CheckpointOffChainList {
    @field(array(option(struct(CheckpointOffChain))))
    checkpoints!: (CheckpointOffChain | undefined)[]

    constructor(fields: any) {
        Object.assign(this, fields)
    }

    static deserialize(raw: Uint8Array): CheckpointOffChainList {
        return deserialize(CheckpointOffChainList, raw)
    }
}

/// Represent the on-chain checkpoint.
export class Checkpoint {
    @field('u8-array')
    root!: Uint8Array

    @field('u64')
    accessVersion!: bigint

    @field(struct(VersionedData))
    rootData!: VersionedData

    @field(struct(SharedData))
    sharedData!: SharedData

    @field(array('u8-array'))
    proofs!: Uint8Array[]

    constructor(fields: any) {
        Object.assign(this, fields)
    }

    static default(): Checkpoint {
        return new Checkpoint({ accessVersion: 0n, data: new Map() })
    }

    static fromParts(offchainPart: CheckpointOffChain, onchainPart: CheckpointOnChain): Checkpoint {
        let checkpoint = Checkpoint.default()
        checkpoint.proofs = offchainPart.proofs
        checkpoint.rootData = offchainPart.rootData
        checkpoint.sharedData = offchainPart.sharedData
        checkpoint.accessVersion = onchainPart.accessVersion
        return checkpoint
    }

    static fromRaw(raw: Uint8Array): Checkpoint {
        if (raw.length === 0) {
            return Checkpoint.default()
        }
        return deserialize(Checkpoint, raw)
    }

    static fromData(id: number, version: bigint, data: Uint8Array): Checkpoint {
        return new Checkpoint({
            data: new Map([
                [
                    id,
                    new VersionedData({
                        version,
                        data,
                    }),
                ],
            ]),
        })
    }

    clone(): Checkpoint {
        return structuredClone(this)
    }

    updateRootAndProofs() {}
}

export class ContextCheckpoint {
    rootData: VersionedData
    sharedData: SharedData

    constructor(sharedData: SharedData, rootData: VersionedData) {
        this.rootData = rootData
        this.sharedData = sharedData
    }
}
