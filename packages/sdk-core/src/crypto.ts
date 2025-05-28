let __subtle_impl: SubtleCrypto | undefined = undefined

export function __set_subtle_impl(subtle: SubtleCrypto) {
    __subtle_impl = subtle
}

export function subtle(): SubtleCrypto {
    if (typeof window === 'object') {
        return window.crypto.subtle
    } else if (typeof self === 'object') {
        return self.crypto.subtle
    } else if (!__subtle_impl) {
        throw new Error('No subtle crypto available. Call `setupNodeEnv()` to configure it.')
    } else {
        return __subtle_impl
    }
}
