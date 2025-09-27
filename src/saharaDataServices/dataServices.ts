import {formatUnits, MaxUint256, parseEther, Wallet} from 'ethers'
import {gotScraping, GotScraping} from 'got-scraping'
import {appendToFile, bigintToPrettyStr, c, defaultSleep, RandomHelpers, retry} from '../utils/helpers'
import {executionSetup, logToFile, YBSetup} from '../../config'
import {YBStrategy__factory} from '../../typechain'
import {chains, YBStrategies} from '../constants'
import {approve, getBalance, sendTx} from '../utils/web3Client'
import {OdosAggregator} from './odosAggregator'
import {getNativeCoinPrice, getRandomProxyProvider} from '../utils'

class SaharaDataServices {
    index: number
    signer: Wallet

    strategy: string

    constructor(index: number, signer: Wallet) {
        this.index = index
        this.signer = signer
        this.strategy = RandomHelpers.getRandomElementFromArray(YBSetup.pools)
    }
    async depositIntoStrategy() {
        // has collateral check
        let collateralBalance = await getBalance(this.signer, this.signer.address, YBStrategies[this.strategy].collateralToken)
        if (collateralBalance == 0n) {
            let success = await this.purchaseCollateral()
            if (!success) {
                throw Error(`Could not buy collateral token (${this.strategy})`)
            }
            await defaultSleep(RandomHelpers.getRandomNumber(executionSetup.sleepBetweenActions), false)
            collateralBalance = await getBalance(this.signer, this.signer.address, YBStrategies[this.strategy].collateralToken)
        }
        let strategyContract = YBStrategy__factory.connect(YBStrategies[this.strategy].deposit, this.signer)

        let approved = await approve(
            this.signer,
            YBStrategies[this.strategy].collateralToken,
            YBStrategies[this.strategy].deposit,
            MaxUint256,
            parseEther('1')
        )
        if (approved != '') {
            await defaultSleep(RandomHelpers.getRandomNumber(executionSetup.sleepBetweenActions), false)
        }
        let btcPrice = await getNativeCoinPrice('BTC')
        if (btcPrice == 0) {
            throw Error(`Could not fetch BTC price (${this.strategy})`)
        }
        let adjustDecimals = this.strategy == 'tBTC' ? 1n : 10n ** 10n
        let LPTokensToReceive = await strategyContract.preview_deposit(
            collateralBalance,
            (BigInt(Math.floor(btcPrice)) * collateralBalance * adjustDecimals * 99n) / 100n
        )

        let data = strategyContract.interface.encodeFunctionData('deposit(uint256,uint256,uint256)', [
            collateralBalance, // assetAmount
            (BigInt(Math.floor(btcPrice)) * collateralBalance * adjustDecimals * 99n) / 100n, // debtCost
            LPTokensToReceive // minShares
        ])
        let gasLimit: bigint | undefined = undefined
        while (true) {
            try {
                gasLimit = await strategyContract['deposit(uint256,uint256,uint256)'].estimateGas(
                    collateralBalance, // assetAmount
                    (BigInt(Math.floor(btcPrice)) * collateralBalance * adjustDecimals * 99n) / 100n, // debtCost
                    LPTokensToReceive // minShares
                )
                break
            } catch (e: any) {
                await defaultSleep(5, false)
            }
        }
        let hash = await sendTx(
            this.signer,
            {
                to: YBStrategies[this.strategy].deposit,
                data: data,
                value: 0n,
                gasLimit: (gasLimit * 15n) / 10n
            },
            {price: 3, limit: 1.5}
        )
        this.print(`Tried to enter strategy: ${chains['Ethereum'].explorer + hash}`, c.green)
        return true
    }
    async anyTokenPurchased() {
        for (let pool of YBSetup.pools) {
            let collateralToken = YBStrategies[pool].collateralToken
            let collateralTokenBalance = await getBalance(this.signer, this.signer.address, collateralToken)
            if (collateralTokenBalance > 0n) {
                this.print(`Already purchased ${pool} token`, c.blue)
                return pool
            }
        }
        return undefined
    }
    async anyStrategyCompleted() {
        for (let pool of YBSetup.pools) {
            let LPTokenBalance = await this.hasDeposited(pool)
            if (LPTokenBalance > 0n) {
                this.print(`Already deposited into ${pool} pool`, c.yellow)
                return pool
            }
        }
        return undefined
    }
    async hasDeposited(strategy: string) {
        return getBalance(this.signer, this.signer.address, YBStrategies[strategy].LPToken)
    }
    async purchaseCollateral() {
        let odos = new OdosAggregator(this.signer, 'Ethereum', RandomHelpers.getRandomProxy(), RandomHelpers.proxies)
        let nativeToken = {
            address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            name: chains['Ethereum'].currency.name,
            symbol: chains['Ethereum'].currency.name,
            decimals: 18n
        }
        let tokenOut = {
            address: YBStrategies[this.strategy].collateralToken,
            name: this.strategy,
            symbol: this.strategy,
            decimals: YBStrategies[this.strategy].collateralTokenDecimals
        }
        let success = await odos.swap(
            nativeToken,
            tokenOut,
            RandomHelpers.getRandomBigInt({from: parseEther(YBSetup.ethToSwap.from), to: parseEther(YBSetup.ethToSwap.to)})
        )
        return success
    }
    print(text: string, chalk?: (...text: unknown[]) => string) {
        function cleanLog(message: string) {
            return message.replaceAll(/[[0-9;]*m/g, '')
        }
        let date = new Date().toISOString().split('T')[1].split('.')[0]
        if (chalk != undefined) {
            console.log(c.hex(this.signer.address)(`#${this.index ?? '?'} ${this.signer.address}:`), chalk(text))
            if (logToFile) {
                let str = `#${this.index ?? '?'} ${this.signer.address}:` + ' ' + date + ' ' + text + '\n'
                appendToFile('log.log', cleanLog(str))
            }
        } else {
            console.log(c.hex(this.signer.address)(`#${this.index ?? '?'} ${this.signer.address}:`), text)
            if (logToFile) {
                let str = `#${this.index ?? '?'} ${this.signer.address}:` + ' ' + date + ' ' + text + '\n'
                appendToFile('log.log', cleanLog(str))
            }
        }
    }
}
async function depositIntoYB(index: number, signer: Wallet) {
    let result = await retry(
        async () => {
            let YBDepositer = new SaharaDataServices(index, signer.connect(getRandomProxyProvider(RandomHelpers.getRandomProxy(), 'Ethereum')))
            YBDepositer.print('Account started', c.cyan)
            let depositDone = await YBDepositer.anyStrategyCompleted()
            if (depositDone != undefined) {
                return false
            }
            await YBDepositer.depositIntoStrategy()
            return true
        },
        {maxRetryCount: 10, retryInterval: 1, throwOnError: false, errorMessage: 'Error on depositIntoYB', needLog: true}
    )
    if (result == undefined) {
        return false
    }
    return result
}
export {depositIntoYB}
