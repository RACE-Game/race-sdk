import { UnionFromValues } from './types'

export const CLIENT_MODES = ['Player', 'Transactor', 'Validator'] as const
export type ClientMode = UnionFromValues<typeof CLIENT_MODES>
