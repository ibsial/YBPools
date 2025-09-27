export const DEV = true
export const logToFile = true
export const maxRetries = 2
export const shuffleWallets = false
export const skipFirst = 0 // skips first N wallets

export const executionSetup = {
    executionMode: 'async', // 'async' | 'one-by-one'

    sleepBetweenActions: {from: 5, to: 20}, // sec
    sleepBetweenAccs: {from: 10, to: 15}, // sec

    batchSize: 10, // accounts per batch
    sleepBetweenBatches: 5 // only for *async* mode
}

export const YBSetup = {
    ethToSwap: {from: '0.01', to: '0.01'}, // eth
    pools: ['WBTC', 'cbBTC', 'tBTC'] // strategy
}
