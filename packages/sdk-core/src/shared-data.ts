import { Node, INode } from './node'
import { ClientMode } from './client-mode'
import { array, field, struct } from '@race-foundation/borsh'
import { PlayerBalance } from './player-balance'
import { Fields } from './types'

export interface ISharedData {
    balances: PlayerBalance[]
    nodes: INode[]
}

export class SharedData {
    @field(array(struct(PlayerBalance)))
    balances!: PlayerBalance[]

    @field(array(struct(Node)))
    nodes!: Node[]

    generalize(): ISharedData {
        return {
            balances: this.balances,
            nodes: this.nodes.map(n => n.generalize()),
        }
    }

    constructor(fields: Fields<SharedData>) {
        Object.assign(this, fields)
    }
}
