/* eslint-disable prefer-const */
import { log } from '@graphprotocol/graph-ts'
import { PairCreated } from '../types/FeSwapFactory/FeSwapFactory'
import { Bundle, Pair, Token, FeSwapFactory } from '../types/schema'
import { Pair as PairTemplate } from '../types/templates'
import {
  FACTORY_ADDRESS,
  fetchTokenDecimals,
  fetchTokenName,
  fetchTokenSymbol,
  fetchTokenTotalSupply,
  ZERO_BD,
  ZERO_BI,
} from './helpers'
import { isOnWhitelist, WETH_ADDRESS } from './pricing'

export function handleNewPair(event: PairCreated): void {
  // load factory (create if first exchange)
  let factory = FeSwapFactory.load(FACTORY_ADDRESS)
  if (factory === null) {
    factory = new FeSwapFactory(FACTORY_ADDRESS)
    factory.pairCount = 0
    factory.totalVolumeETH = ZERO_BD
    factory.totalVolumeUSD = ZERO_BD
    factory.untrackedVolumeUSD = ZERO_BD
    factory.totalLiquidityETH = ZERO_BD
    factory.totalLiquidityUSD = ZERO_BD
    factory.txCount = ZERO_BI
    factory.save()

    // create new bundle
    let bundle = new Bundle('1')
    bundle.ethPrice = ZERO_BD
    bundle.save()
  }
  factory.pairCount = factory.pairCount + 1

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
    token0.whitelist = []
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
    token1.whitelist = []
    token1.txCount = ZERO_BI
  }

  if (isOnWhitelist(token1.id)) {
    let whitelist0 = token0.whitelist
    whitelist0.push(event.params.pairAAB.toHexString())
    token0.whitelist = whitelist0
  }

  if (isOnWhitelist(token0.id)) {
    let whitelist1 = token1.whitelist
    whitelist1.push(event.params.pairABB.toHexString())
    token1.whitelist = whitelist1
  }

  let pairAAB = new Pair(event.params.pairAAB.toHexString()) as Pair
  pairAAB.sibling = event.params.pairABB.toHexString()
  pairAAB.token0 = token0.id
  pairAAB.token1 = token1.id
  pairAAB.reserve0 = ZERO_BD
  pairAAB.reserve1 = ZERO_BD
  pairAAB.totalSupply = ZERO_BD

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
  pairABB.sibling = event.params.pairAAB.toHexString()
  // swap the order here
  pairABB.token0 = token1.id
  pairABB.token1 = token0.id
  pairABB.reserve0 = ZERO_BD
  pairABB.reserve1 = ZERO_BD
  pairABB.totalSupply = ZERO_BD

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
  factory.save()
}
