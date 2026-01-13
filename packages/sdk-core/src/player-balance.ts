import { field } from '@race-foundation/borsh'
import { Fields } from './types'

export interface IPlayerBalance {
    readonly playerId: bigint
    readonly balance: bigint
}

export class PlayerBalance implements IPlayerBalance {
    @field('u64')
    playerId!: bigint

    @field('u64')
    balance!: bigint

    constructor(fields: Fields<PlayerBalance>) {
        Object.assign(this, fields)
    }
}
