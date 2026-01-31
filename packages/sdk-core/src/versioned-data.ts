import { array, deserialize, serialize, field, map, option, struct, enums } from '@race-foundation/borsh'
import { sha256 } from './utils'
import { Fields } from './types'
import { GameEvent } from './events'
import { EmitBridgeEvent, LaunchSubGame, PlayerBalance } from './effect'
import { SharedData } from './shared-data'
import { DispatchEvent } from './dispatch-event'
import { GameSpec } from './game-spec'
import { Versions } from './versions'
import { Node, INodeStatus } from './node'
import { ClientMode } from './client-mode'

export class VersionedData {
    @field(struct(GameSpec))
    gameSpec!: GameSpec

    @field(struct(Versions))
    versions!: Versions

    @field(map('usize', struct(VersionedData)))
    subData!: Map<number, VersionedData>

    @field('u8-array')
    handlerState!: Uint8Array

    @field(option(struct(DispatchEvent)))
    dispatch!: DispatchEvent | undefined

    @field(array(struct(EmitBridgeEvent)))
    bridgeEvents!: EmitBridgeEvent[]

    constructor(fields: any) {
        Object.assign(this, fields)
    }

    static init(gameSpec: GameSpec, versions: Versions, handlerState: Uint8Array): VersionedData {
        return new VersionedData({
            gameSpec,
            versions,
            handlerState,
            subData: new Map(),
            dispatch: undefined,
            bridgeEvents: [],
        })
    }

    async sha(): Promise<Uint8Array> {
        const bs = await serialize(this);
        return sha256(bs);
    }

    getSubData(gameId: number): VersionedData | undefined {
        return this.subData.get(gameId)
    }

    initSubData(versionedData: VersionedData) {
        const gameId = versionedData.gameSpec.gameId

        if (this.subData.has(gameId)) {
            throw new Error('Checkpoint already exists')
        } else {
            this.subData.set(gameId, versionedData)
        }
    }

    updateSubData(versionedData: VersionedData) {
        const gameId = versionedData.gameSpec.gameId

        if (this.subData.has(gameId)) {
            this.subData.set(gameId, versionedData)
        } else {
            throw new Error('Missing checkpoint')
        }
    }
}
