import {
  EdgeCorePluginOptions,
  EdgeSwapInfo,
  EdgeSwapPlugin,
  EdgeSwapQuote,
  EdgeSwapRequest,
  SwapCurrencyError
} from 'edge-core-js/types'

import { makeSwapPluginQuote } from '../swap-helpers'
import { convertRequest } from '../util/utils'

const pluginId = 'transfer'

const swapInfo: EdgeSwapInfo = {
  pluginId,
  displayName: 'Transfer',
  orderUri: undefined,
  supportEmail: 'support@edge.com'
}

export function makeTransferPlugin(
  opts: EdgeCorePluginOptions
): EdgeSwapPlugin {
  const out: EdgeSwapPlugin = {
    swapInfo,

    async fetchSwapQuote(req: EdgeSwapRequest): Promise<EdgeSwapQuote> {
      const request = convertRequest(req)
      if (
        request.fromWallet.currencyInfo.pluginId !==
          request.toWallet.currencyInfo.pluginId ||
        request.fromCurrencyCode !== request.toCurrencyCode
      ) {
        throw new SwapCurrencyError(
          swapInfo,
          request.fromCurrencyCode,
          request.toCurrencyCode
        )
      }

      const {
        publicAddress: toAddress
      } = await request.toWallet.getReceiveAddress()

      const spendInfo = {
        currencyCode: request.fromCurrencyCode,
        spendTargets: [
          {
            nativeAmount: request.nativeAmount,
            publicAddress: toAddress
          }
        ],
        swapData: {
          isEstimate: false,
          payoutAddress: toAddress,
          plugin: { ...swapInfo },
          payoutCurrencyCode: request.toCurrencyCode,
          payoutNativeAmount: request.nativeAmount,
          payoutWalletId: request.toWallet.id
        }
      }

      return await makeSwapPluginQuote({
        request,
        spendInfo,
        swapInfo,
        fromNativeAmount: request.nativeAmount
      })
    }
  }

  return out
}
