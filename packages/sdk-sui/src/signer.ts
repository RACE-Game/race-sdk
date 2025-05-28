import { SuiClient, SuiTransactionBlockResponse } from "@mysten/sui/dist/cjs/client";
import { Transaction } from "@mysten/sui/dist/cjs/transactions";
import { ResponseHandle, Result } from "@race-foundation/sdk-core";
import { SuiSignAndExecuteTransactionOutput } from '@mysten/wallet-standard'

export type TxResult = SuiSignAndExecuteTransactionOutput | SuiTransactionBlockResponse

export interface ISigner {
  send<T, E>(transaction: Transaction, client: SuiClient, resp: ResponseHandle<T, E>): Promise<Result<TxResult, string>>
}
