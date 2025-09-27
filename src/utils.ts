import axios from 'axios'
import {c, defaultSleep, RandomHelpers, retry} from './utils/helpers'
import {FetchRequest, formatEther, JsonRpcProvider, Network, Networkish, parseEther, Wallet} from 'ethers'
import {HttpsProxyAgent} from 'https-proxy-agent'
import { chains } from './constants'

async function getNativeCoinPrice(networkName: string): Promise<number> {
    let price: number | undefined = await retry(
        async () => {
            // if (chains[networkName].currency?.price != undefined && chains[networkName].currency?.price != 0) {
            //     return chains[networkName].currency?.price
            // }
            var agent = new HttpsProxyAgent("http://"+RandomHelpers.getRandomProxy());
            let url = `https://min-api.cryptocompare.com/data/price?fsym=${networkName}&tsyms=USD`
            let resp = await axios.get(url, {
                httpsAgent: agent
            })
            let body: {USD: number} = resp.data
            return body.USD
        },
        {maxRetryCount: 3, retryInterval: 10, throwOnError: false}
    )
    if (price == undefined) price = 0
    return price
}
function getRandomProxyProvider(proxy: string | undefined, network: string = 'Sahara') {
    let provider: JsonRpcProvider
    let rpc: string = RandomHelpers.getRandomElementFromArray(chains[network].rpc)
    let networkCfg: Networkish = {name: network, chainId: chains[network].id}
    if (proxy) {
        const proxyProvider = new FetchRequest(rpc)
        proxyProvider.getUrlFunc = FetchRequest.createGetUrlFunc({
            httpAgent: new HttpsProxyAgent('http://' + proxy),
            httpsAgent: new HttpsProxyAgent('http://' + proxy),
            agent: new HttpsProxyAgent('http://' + proxy)
        })

        provider = new JsonRpcProvider(rpc, networkCfg, {staticNetwork: true})
    } else {
        provider = new JsonRpcProvider(rpc, networkCfg, {staticNetwork: true})
    }
    return provider
}

export {getNativeCoinPrice, getRandomProxyProvider}
