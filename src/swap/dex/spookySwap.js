// @flow

import { lt } from 'biggystring'
import {
  type EdgeCorePluginOptions,
  type EdgeCurrencyWallet,
  type EdgeSpendInfo,
  type EdgeSwapInfo,
  type EdgeSwapPlugin,
  type EdgeSwapQuote,
  type EdgeSwapRequest,
  type EdgeTransaction,
  SwapBelowLimitError,
  SwapCurrencyError
} from 'edge-core-js/types'
import { ethers } from 'ethers'

import {
  type InvalidCurrencyCodes,
  checkInvalidCodes,
  makeSwapPluginQuote
} from '../../swap-helpers.js'
import {
  BOO_ADDRESS,
  BOO_CONTRACT_ABI,
  SPOOKYSWAP_DEPOSIT_CONTRACT_ABI,
  SPOOKYSWAP_DEPOSIT_CONTRACT_ADDRESS,
  SPOOKYSWAP_FACTORY_ABI,
  SPOOKYSWAP_FACTORY_ADDRESS,
  SPOOKYSWAP_ROUTER_ABI,
  SPOOKYSWAP_ROUTER_ADDRESS,
  SPOOKYSWAP_WITHDRAW_CONTRACT_ABI,
  SPOOKYSWAP_WITHDRAW_CONTRACT_ADDRESS,
  TOMB_ADDRESS,
  uniswapV2PairABI,
  wFTM_BOO_MASTER_CONTRACT_ABI,
  wFTM_BOO_MASTERCHEF_CONTRACT,
  wFTMABI,
  wFTMAddress,
  wFTMBOOspLPAddress
} from './spookyContracts.js'

const INVALID_CURRENCY_CODES = {
  from: {},
  to: {}
}

// Invalid currency codes should *not* have transcribed codes
// because currency codes with transcribed versions are NOT invalid
const CURRENCY_CODE_TRANSCRIPTION = {
  // Edge currencyCode: exchangeCurrencyCode
  ETH: {
    USDT: 'USDT20'
  }
}

const pluginId = 'spookySwap'

const swapInfo: EdgeSwapInfo = {
  pluginId,
  displayName: 'SpookySwap',
  supportEmail: '',
  supportUrl: 'https://discord.com/invite/weXbvPAH4Q'
}
const expirationMs = 1000 * 60 * 60

const SPOOKY_ROUTER_ADDRESS = '0xF491e7B69E4244ad4002BC14e878a34207E38c29'

// TODO: what's the deal here?
const dontUseLegacy = {}
async function getAddress(
  wallet: EdgeCurrencyWallet,
  currencyCode: string
): Promise<string> {
  const addressInfo = await wallet.getReceiveAddress({
    currencyCode
  })

  return addressInfo.legacyAddress && !dontUseLegacy[currencyCode]
    ? addressInfo.legacyAddress
    : addressInfo.publicAddress
}
async function getPrices(pairAddress, provider) {
  // const reserves = await wFTMBOOspLPContract.getReserves()
  // const resv0 = Number(reserves._reserve1)
  // console.log(resv0)
  const wFTMBOOspLPContract = new ethers.Contract(
    wFTMBOOspLPAddress,
    uniswapV2PairABI,
    provider
  )
  const getEthUsdPrice = await wFTMBOOspLPContract
    .getReserves() // TODO: change this contract reference?
    .then(reserves => Number(reserves._reserve0) / Number(reserves._reserve1))
  return getEthUsdPrice
}

export function convertToHex(number: number) {
  const num = '0x' + number.toString(16)
  return num
}

export function makeSpookySwapPlugin(
  opts: EdgeCorePluginOptions
): EdgeSwapPlugin {
  const out: EdgeSwapPlugin = {
    swapInfo,
    async fetchSwapQuote(
      request: EdgeSwapRequest,
      userSettings: Object | void
    ): Promise<EdgeSwapQuote> {
      const { log } = opts

      log.warn('fetchSwapQuote!!')
      const [fromAddress, toAddress] = await Promise.all([
        getAddress(request.fromWallet, request.fromCurrencyCode),
        getAddress(request.toWallet, request.toCurrencyCode)
      ])

      // TODO: Use fallback provider
      const customHttpProvider = new ethers.providers.JsonRpcProvider(
        'https://ftmrpc.ultimatenodes.io'
      )

      const booContract = new ethers.Contract(
        BOO_ADDRESS,
        BOO_CONTRACT_ABI,
        customHttpProvider
      )
      const wFTMContract = new ethers.Contract(
        wFTMAddress,
        wFTMABI,
        customHttpProvider
      )

      const coreWallet = request.fromWallet
      const ethersWallet = new ethers.Wallet(
        coreWallet.displayPrivateSeed,
        customHttpProvider
      )

      const spookySwapRouter = new ethers.Contract(
        SPOOKYSWAP_ROUTER_ADDRESS,
        SPOOKYSWAP_ROUTER_ABI,
        ethersWallet
      )

      // Get price
      const wFTMperBOO = await getPrices(wFTMBOOspLPAddress, customHttpProvider)
      const lpRate = wFTMperBOO

      // Calculate amounts
      const currentBalanceBoo = await booContract.balanceOf(
        ethersWallet.address
      )
      const currentBalanceFtm = await wFTMContract.balanceOf(
        ethersWallet.address
      )
      log.warn(
        '\x1b[37m\x1b[41m' +
          `currentBalanceFtm: ${JSON.stringify(currentBalanceFtm, null, 2)}` +
          '\x1b[0m'
      )
      const amountToSwap = Math.floor(currentBalanceFtm / 2)
      log.warn(
        '\x1b[34m\x1b[43mamountToSwap' +
          `: ${JSON.stringify(amountToSwap, null, 2)}` +
          '\x1b[0m'
      )
      const slippage = Number(0.1)

      const expectedwQuoteAmountOut =
        (amountToSwap / lpRate) * (Number(1) - slippage)
      const expectedwBaseAmountOut =
        amountToSwap * lpRate * (Number(1) - slippage)
      const expectedAmountOut = expectedwQuoteAmountOut

      // TODO: determine ordering token0/1
      const path = [wFTMAddress, TOMB_ADDRESS]

      // Create the transaction:

      log.warn(
        '\x1b[37m\x1b[41m' +
          `amountToSwap: ${JSON.stringify(amountToSwap, null, 2)}` +
          '\x1b[0m'
      )
      log.warn(
        '\x1b[34m\x1b[43m' +
          `convertToHex(amountToSwap): ${JSON.stringify(
            convertToHex(amountToSwap),
            null,
            2
          )}` +
          '\x1b[0m'
      )
      log.warn(
        '\x1b[37m\x1b[41m' +
          `expectedAmountOut: ${JSON.stringify(expectedAmountOut, null, 2)}` +
          '\x1b[0m'
      )
      log.warn(
        '\x1b[34m\x1b[43m' +
          `convertToHex(expectedAmountOut): ${JSON.stringify(
            convertToHex(expectedAmountOut),
            null,
            2
          )}` +
          '\x1b[0m'
      )
      const routerTx = await spookySwapRouter.swapExactTokensForTokens(
        convertToHex(amountToSwap),
        convertToHex(expectedAmountOut),
        path,
        toAddress,
        `0x${(Math.floor(new Date().getTime() / 1000) + 60).toString(16)}`,
        { gasLimit: 360000 }
      )

      // Convert to our spendInfo
      const edgeSpendInfo: EdgeSpendInfo = {
        pluginId: 'spookySwap',
        currencyCode: request.toCurrencyCode,
        spendTargets: [
          {
            nativeAmount: amountToSwap.toString(),
            publicAddress: SPOOKY_ROUTER_ADDRESS, // TODO: right addr?
            otherParams: {
              data: routerTx.data
            }
          }
        ],
        networkFeeOption: 'standard',
        swapData: {
          // TODO: Check GUI if this comes out accurate
          isEstimate: false,
          payoutAddress: toAddress,
          payoutCurrencyCode: request.toCurrencyCode,
          payoutNativeAmount: expectedAmountOut.toString(),
          payoutWalletId: request.toWallet.id,
          plugin: { ...swapInfo },
          refundAddress: fromAddress
        }
      }
      log.warn(
        '\x1b[34m\x1b[43m' +
          `edgeSpendInfo: ${JSON.stringify(edgeSpendInfo, null, 2)}` +
          '\x1b[0m'
      )

      // TODO: Maybe ditch the accountbased's makeSpend
      // TODO: and make my own here if ab doesn't cooperate
      const edgeUnsignedTx: EdgeTransaction = await request.fromWallet.makeSpend(
        edgeSpendInfo
      )

      log.warn('makeSwapPluginQuote')
      const test = amountToSwap.toString()
      log.warn('test' + test)
      const test2 = expectedAmountOut.toString()
      log.warn('test2' + test2)

      // Convert that to the output format:
      return makeSwapPluginQuote(
        request,
        amountToSwap.toString(),
        expectedAmountOut.toString(),
        edgeUnsignedTx,
        toAddress,
        'spookySwap',
        false, // TODO: is this right or even needed?
        new Date(Date.now() + expirationMs)
      )
    }
  }

  return out
}
