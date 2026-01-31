import { field, enums } from '@race-foundation/borsh'
import { GameEvent } from './events'
import { Fields } from './types'

export class DispatchEvent {
    @field('u64')
    timeout!: bigint

    @field(enums(GameEvent))
    event!: GameEvent

    constructor(fields: Fields<DispatchEvent>) {
        Object.assign(this, fields)
    }
}
