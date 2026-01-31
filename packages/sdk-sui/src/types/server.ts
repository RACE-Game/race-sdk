import { bcs } from '@mysten/bcs'
import { Address, Parser } from './parser'
import { IServerAccount } from '@race-foundation/sdk-core'

const ServerSchema = bcs.struct('Server', {
    id: Address,
    owner: Address,
    endpoint: bcs.string(),
})

export const ServerParser: Parser<IServerAccount, typeof ServerSchema> = {
    schema: ServerSchema,
    transform: (input: typeof ServerSchema.$inferType): IServerAccount => {
        return {
            addr: input.id,
            endpoint: input.endpoint,
        }
    },
}
