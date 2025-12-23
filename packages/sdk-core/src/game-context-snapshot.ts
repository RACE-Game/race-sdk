import { DecryptionCache } from './decryption-cache'
import { GameContext, GameStatus } from './game-context'
import { INode, INodeStatus } from './node'
import { RandomState } from './random-state'

export class NodeSnapshot {
    readonly id: bigint
    readonly addr: string
    readonly status: INodeStatus

    constructor(o: INode) {
        this.id = o.id
        this.addr = o.addr
        this.status = o.status
    }
}

type RevealedMap = Map<number, Map<number, string>>

export class GameContextSnapshot {
    readonly gameAddr: string
    readonly accessVersion: bigint
    readonly settleVersion: bigint
    readonly status: GameStatus
    readonly nodes: NodeSnapshot[]
    readonly revealed: RevealedMap

    constructor(context: GameContext, decryptionCache: DecryptionCache) {
        this.gameAddr = context.gameSpec.gameAddr
        this.accessVersion = context.accessVersion
        this.settleVersion = context.settleVersion
        this.status = context.status
        this.nodes = context.nodes.map((n: INode) => new NodeSnapshot(n))
        this.revealed = context.randomStates.reduce((acc: RevealedMap, item: RandomState) => {
            acc.set(item.id, decryptionCache.get(item.id) || new Map())
            return acc
        }, new Map())
    }
}
