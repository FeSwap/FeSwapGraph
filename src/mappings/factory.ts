/* eslint-disable prefer-const */
import { Address, log } from '@graphprotocol/graph-ts'
import { PairCreated, SetFeeToCall } from '../types/FeSwapFactory/FeSwapFactory'
import { Bundle, Pair, Token, FeSwapFactory, InnerSwapInfo } from '../types/schema'
import { Pair as PairTemplate } from '../types/templates'
import {
  FACTORY_ADDRESS,
  ADDRESS_ZERO,
  fetchFactoryFeeTo,
  fetchTokenDecimals,
  fetchTokenName,
  fetchTokenSymbol,
  fetchTokenTotalSupply,
  ZERO_BD,
  ZERO_BI,
} from './helpers'
import { isOnWhitelist, WETH_ADDRESS } from './pricing'

/*
export function handleSetFeeTo(call: SetFeeToCall): void {
  let factory = FeSwapFactory.load(FACTORY_ADDRESS)!
  factory.feeTo = call.inputs._feeTo
  factory.save()
} 
*/ 

export function handleNewPair(event: PairCreated): void {
  // load factory (create if first exchange)
  let feswapFactory = FeSwapFactory.load(FACTORY_ADDRESS)
  if (feswapFactory === null) {
    feswapFactory = new FeSwapFactory(FACTORY_ADDRESS)
    feswapFactory.pairCount = 0
    feswapFactory.totalVolumeETH = ZERO_BD
    feswapFactory.totalVolumeUSD = ZERO_BD
    feswapFactory.untrackedVolumeUSD = ZERO_BD
    feswapFactory.totalLiquidityETH = ZERO_BD
    feswapFactory.totalLiquidityUSD = ZERO_BD
    feswapFactory.feeTo = Address.fromString(ADDRESS_ZERO)
    feswapFactory.txCount = ZERO_BI
    feswapFactory.save()

    // create new bundle
    let bundle = new Bundle('1')
    bundle.ethPrice = ZERO_BD
    bundle.save()

    // Initialize innerSwapInfo
    let innerSwapInfo = new InnerSwapInfo('S')
    innerSwapInfo.transaction = ADDRESS_ZERO
    innerSwapInfo.logIndex = ZERO_BI
    innerSwapInfo.pair = ADDRESS_ZERO
    innerSwapInfo.reserve0 = ZERO_BD
    innerSwapInfo.reserve1 = ZERO_BD
    innerSwapInfo.save()
  }

  feswapFactory.pairCount = feswapFactory.pairCount + 1
  feswapFactory.feeTo = fetchFactoryFeeTo()

  // create the tokens
  let token0 = Token.load(event.params.tokenA.toHexString())
  let token1 = Token.load(event.params.tokenB.toHexString())

  // fetch info if null
  if (token0 === null) {
    token0 = new Token(event.params.tokenA.toHexString())
    token0.symbol = fetchTokenSymbol(event.params.tokenA)
    token0.name = fetchTokenName(event.params.tokenA)
    token0.totalSupply = fetchTokenTotalSupply(event.params.tokenA)
    let decimals = fetchTokenDecimals(event.params.tokenA)

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug('Decimal on token 0 was null', [event.params.tokenA.toHexString()])
      return
    }

    token0.decimals = decimals
    token0.derivedETH = ZERO_BD
    token0.tradeVolume = ZERO_BD
    token0.tradeVolumeUSD = ZERO_BD
    token0.untrackedVolumeUSD = ZERO_BD
    token0.totalLiquidity = ZERO_BD
    token0.txCount = ZERO_BI
  }

  // fetch info if null
  if (token1 === null) {
    token1 = new Token(event.params.tokenB.toHexString())
    token1.symbol = fetchTokenSymbol(event.params.tokenB)
    token1.name = fetchTokenName(event.params.tokenB)
    token1.totalSupply = fetchTokenTotalSupply(event.params.tokenB)
    let decimals = fetchTokenDecimals(event.params.tokenB)

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug('Decimal on token 1 was null', [event.params.tokenB.toHexString()])
      return
    }
    token1.decimals = decimals
    token1.derivedETH = ZERO_BD
    token1.tradeVolume = ZERO_BD
    token1.tradeVolumeUSD = ZERO_BD
    token1.untrackedVolumeUSD = ZERO_BD
    token1.totalLiquidity = ZERO_BD
    token1.txCount = ZERO_BI
  }

  let pairAAB = new Pair(event.params.pairAAB.toHexString()) as Pair
//  pairAAB.pairOwner = Address.fromString(ADDRESS_ZERO)
//  pairAAB.profitPairOwner = ZERO_BD
//  pairAAB.profitProtocol = ZERO_BD
//  pairAAB.rateTrigger = 10100
  pairAAB.sibling = event.params.pairABB.toHexString()
  pairAAB.token0 = token0.id
  pairAAB.token1 = token1.id
  pairAAB.reserve0 = ZERO_BD
  pairAAB.reserve1 = ZERO_BD
  pairAAB.totalSupply = ZERO_BD
  pairAAB.KValueAddedPerLiquidity = ZERO_BD
  pairAAB.innerSwapCount = ZERO_BI
  pairAAB.timestampFirstSwap = ZERO_BI

  pairAAB.reserveETH = ZERO_BD
  pairAAB.reserveUSD = ZERO_BD
  pairAAB.trackedReserveETH = ZERO_BD

  pairAAB.token0Price = ZERO_BD
  pairAAB.token1Price = ZERO_BD

  pairAAB.volumeToken0 = ZERO_BD
  pairAAB.volumeToken1 = ZERO_BD
  pairAAB.volumeUSD = ZERO_BD
  pairAAB.untrackedVolumeUSD = ZERO_BD
  pairAAB.txCount = ZERO_BI

  pairAAB.liquidityProviderCount = ZERO_BI
  pairAAB.createdAtTimestamp = event.block.timestamp
  pairAAB.createdAtBlockNumber = event.block.number

  let pairABB = new Pair(event.params.pairABB.toHexString()) as Pair
//  pairABB.pairOwner = Address.fromString(ADDRESS_ZERO)
//  pairABB.profitPairOwner = ZERO_BD
//  pairABB.profitProtocol = ZERO_BD
//  pairABB.rateTrigger = 10100
  pairABB.sibling = event.params.pairAAB.toHexString()
  // swap the order here
  pairABB.token0 = token1.id
  pairABB.token1 = token0.id
  pairABB.reserve0 = ZERO_BD
  pairABB.reserve1 = ZERO_BD
  pairABB.totalSupply = ZERO_BD
  pairABB.KValueAddedPerLiquidity = ZERO_BD
  pairABB.innerSwapCount = ZERO_BI
  pairABB.timestampFirstSwap = ZERO_BI

  pairABB.reserveETH = ZERO_BD
  pairABB.reserveUSD = ZERO_BD
  pairABB.trackedReserveETH = ZERO_BD

  pairABB.token0Price = ZERO_BD
  pairABB.token1Price = ZERO_BD

  pairABB.volumeToken0 = ZERO_BD
  pairABB.volumeToken1 = ZERO_BD
  pairABB.volumeUSD = ZERO_BD
  pairABB.untrackedVolumeUSD = ZERO_BD
  pairABB.txCount = ZERO_BI

  pairABB.liquidityProviderCount = ZERO_BI
  pairABB.createdAtTimestamp = event.block.timestamp
  pairABB.createdAtBlockNumber = event.block.number

  // create the tracked contract based on the template
  PairTemplate.create(event.params.pairAAB)
  PairTemplate.create(event.params.pairABB)

  // save updated values
  token0.save()
  token1.save()
  pairAAB.save()
  pairABB.save()
  feswapFactory.save()
}
