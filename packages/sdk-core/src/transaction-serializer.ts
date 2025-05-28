
/**
 * Serialize & deserialize a transaction
 * This is useful for web worker context, since the wallet instance is not available in web worker.
 * By serializing the transaction, we can create it in worker but sign and send it in page.
 */
export interface ITransactionSerializer<T> {
    serialize(transaction: T):  Uint8Array

    deserialize(bytes: Uint8Array): T
}
