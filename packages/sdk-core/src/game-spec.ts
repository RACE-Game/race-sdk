import { field, enums } from '@race-foundation/borsh'
import { Fields } from './types'
import { AEntryType } from './entry-type'

export class GameSpec {
    @field('string')
    readonly gameAddr!: string

    @field('usize')
    readonly gameId!: number

    @field('string')
    readonly bundleAddr!: string

    @field('u16')
    readonly maxPlayers!: number

    @field(enums(AEntryType))
    readonly entryType!: AEntryType

    constructor(fields: Fields<GameSpec>) {
        Object.assign(this, fields)
    }
}
