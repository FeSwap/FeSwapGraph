/* eslint-disable prefer-const */
import { Pair, Token, Bundle } from '../types/schema'
import { BigDecimal, Address, BigInt } from '@graphprotocol/graph-ts/index'
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD, FACTORY_ADDRESS } from './helpers'

export const WETH_ADDRESS = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'
export const UCDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
export const USDT_ADDRESS = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f'
export const DAI_ADDRESS  = '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063'

export const USDC_WETH_PAIR = '0x307808bac9d48102322f33464e7d9547abe8d33e'
export const WETH_USDC_PAIR = '0x885abf5f910f861cda642c1cb35de64b5d054245'

export const USDT_WETH_PAIR = '0x386b5134a54239bfbe26bd6a28550cfe16fd137b' 
export const WETH_USDT_PAIR = '0x0c4e932b5c41e51257d7cfa4e84c0532c7e93ad3' 

export const DAI_WETH_PAIR = '0x77bce879bf35bded949cc73b8e35137718bf08c4'
export const WETH_DAI_PAIR = '0x92335c2b856363538ef01d97fc4e6c85d1128f35' 

export function getEthPriceInUSD(): BigDecimal {
  // Only consider USDC_WETH pair for simple and performance
  let usdc_weth_Pair = Pair.load(USDC_WETH_PAIR);
  let weth_usdc_Pair = Pair.load(WETH_USDC_PAIR);

  if( (usdc_weth_Pair !== null) &&  (weth_usdc_Pair !== null) ) {
    let eth_reserve = usdc_weth_Pair.reserve1.plus(weth_usdc_Pair.reserve0)
    let usdc_reserve = usdc_weth_Pair.reserve0.plus(weth_usdc_Pair.reserve1)
    // called in swap, eth_reserve must be more than 0
    if(eth_reserve.gt(BigDecimal.fromString('0.2')))
      return usdc_reserve.div(eth_reserve)
  }
  return ZERO_BD

  // fetch eth prices for each stablecoin
/*  let usdcPair = Pair.load(USDC_WETH_PAIR) // usdc is token0
  let usdtPair = Pair.load(USDT_WETH_PAIR) // usdt is token1

  // all 3 have been created
  if (daiPair !== null && usdcPair !== null && usdtPair !== null) {
    let totalLiquidityETH = daiPair.reserve1.plus(usdcPair.reserve1).plus(usdtPair.reserve0)
    let daiWeight = daiPair.reserve1.div(totalLiquidityETH)
    let usdcWeight = usdcPair.reserve1.div(totalLiquidityETH)
    let usdtWeight = usdtPair.reserve0.div(totalLiquidityETH)
    return daiPair.token0Price
      .times(daiWeight)
      .plus(usdcPair.token0Price.times(usdcWeight))
      .plus(usdtPair.token1Price.times(usdtWeight))
    // dai and USDC have been created
  } else if (daiPair !== null && usdcPair !== null) {
    let totalLiquidityETH = daiPair.reserve1.plus(usdcPair.reserve1)
    let daiWeight = daiPair.reserve1.div(totalLiquidityETH)
    let usdcWeight = usdcPair.reserve1.div(totalLiquidityETH)
    return daiPair.token0Price.times(daiWeight).plus(usdcPair.token0Price.times(usdcWeight))
    // USDC is the only pair so far
  } else if (usdcPair !== null) {
    return usdcPair.token0Price
  } else {
    return ZERO_BD
  }
  */
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', // WETH
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC
  '0xa3fa99a148fa48d14ed51d610c367c61876997f1', // miMATIC
  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // WMATIC
  '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', // WBTC
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', // DAI
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // USDT
  '0xd6df932a45c0f255f85145f286ea0b292b21c90b', // AAVE
  '0x831753dd7087cac61ab5644b308642cc1c33dc13', // QUICK
  '0x0be3afd0a28f0aa787d113c08d1d8a903cf6eee9', // FESW@M
]

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_ETH = BigDecimal.fromString('0.2')

export function isOnWhitelist(token: string): boolean {
  for(var i = 0; i < WHITELIST.length; i++) {
    if(token == WHITELIST[i]) return true
  }
  return false
}

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }
  // loop through whitelist and check if paired with any
  let whitelist = token.whitelist
  for (let i = 0; i < whitelist.length; i++) {
      let pairAddress = whitelist[i]
      let pairAAB = Pair.load(pairAddress)!
      let pairABB = Pair.load(pairAAB.sibling)!
      if(pairAAB.reserveETH.plus(pairABB.reserveETH).gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH))
      {        
        let token1 = Token.load(pairAAB.token1)!
        return pairAAB.reserve1.plus(pairABB.reserve0).div(pairAAB.reserve0.plus(pairABB.reserve1))
                      .times(token1.derivedETH as BigDecimal) // return token1 per our token * Eth per token 1
      }
  }
  return ZERO_BD // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  bundle: Bundle
): BigDecimal {
  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  // if less than 5 LPs, require high minimum reserve amount amount or return 0
  /*  if (pair.liquidityProviderCount.lt(BigInt.fromI32(5))) {
    let reserve0USD = pair.reserve0.times(price0)
    let reserve1USD = pair.reserve1.times(price1)
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
      if (reserve0USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve1USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
  } */

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  bundle: Bundle
): BigDecimal {
  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
