/* eslint-disable prefer-const */
import { BigDecimal, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { Bundle, Pair, PairDayData, Token, TokenDayData, FeSwapDayData, FeSwapFactory } from '../types/schema'
// import { PairHourData } from './../types/schema'
import { ONE_BI, ZERO_BD, ZERO_BI } from './helpers'

export function updateFeSwapDayData(feswapFactory: FeSwapFactory, event: ethereum.Event): FeSwapDayData {
  let timestamp = event.block.timestamp.toI32()
  let dayID = timestamp / 86400
  let dayStartTimestamp = dayID * 86400
  let feswapDayData = FeSwapDayData.load(dayID.toString())
  if (feswapDayData === null) {
    feswapDayData = new FeSwapDayData(dayID.toString())
    feswapDayData.date = dayStartTimestamp
    feswapDayData.dailyVolumeETH = ZERO_BD
    feswapDayData.dailyVolumeUSD = ZERO_BD
    feswapDayData.dailyVolumeUntracked = ZERO_BD
  }
  feswapDayData.totalVolumeETH = feswapFactory.totalVolumeETH
  feswapDayData.totalVolumeUSD = feswapFactory.totalVolumeUSD
  feswapDayData.totalLiquidityETH = feswapFactory.totalLiquidityETH
  feswapDayData.totalLiquidityUSD = feswapFactory.totalLiquidityUSD
  feswapDayData.txCount = feswapFactory.txCount

  return feswapDayData as FeSwapDayData
}

export function updatePairDayData(pair: Pair, event: ethereum.Event): PairDayData {
  let timestamp = event.block.timestamp.toI32()
  let dayID = timestamp / 86400
  let dayStartTimestamp = dayID * 86400
  let dayPairID = pair.id
    .concat('-')
    .concat(BigInt.fromI32(dayID).toString())
  let pairDayData = PairDayData.load(dayPairID)
  if (pairDayData === null) {
    pairDayData = new PairDayData(dayPairID)
    pairDayData.date = dayStartTimestamp
    pairDayData.token0 = pair.token0
    pairDayData.token1 = pair.token1
    pairDayData.pairAddress = changetype<Bytes>(Bytes.fromHexString(pair.id))
    pairDayData.dailyVolumeToken0 = ZERO_BD
    pairDayData.dailyVolumeToken1 = ZERO_BD
    pairDayData.dailyVolumeUSD = ZERO_BD
    pairDayData.dailyTxns = ZERO_BI
    pairDayData.dailyKValueAddedPerLiquidity = ZERO_BD
  }

  pairDayData.totalSupply = pair.totalSupply
  pairDayData.reserve0 = pair.reserve0
  pairDayData.reserve1 = pair.reserve1
  pairDayData.reserveUSD = pair.reserveUSD
  pairDayData.dailyTxns = pairDayData.dailyTxns.plus(ONE_BI)

  return pairDayData as PairDayData
}

/*
export function updatePairHourData(pair: Pair, event: ethereum.Event): PairHourData {
  let timestamp = event.block.timestamp.toI32()
  let hourIndex = timestamp / 3600 // get unique hour within unix history
  let hourStartUnix = hourIndex * 3600 // want the rounded effect
  let hourPairID = event.address
    .toHexString()
    .concat('-')
    .concat(BigInt.fromI32(hourIndex).toString())
  let pairHourData = PairHourData.load(hourPairID)
  if (pairHourData === null) {
    pairHourData = new PairHourData(hourPairID)
    pairHourData.hourStartUnix = hourStartUnix
    pairHourData.pair = event.address.toHexString()
    pairHourData.hourlyVolumeToken0 = ZERO_BD
    pairHourData.hourlyVolumeToken1 = ZERO_BD
    pairHourData.hourlyVolumeUSD = ZERO_BD
    pairHourData.hourlyTxns = ZERO_BI
  }

  pairHourData.totalSupply = pair.totalSupply
  pairHourData.reserve0 = pair.reserve0
  pairHourData.reserve1 = pair.reserve1
  pairHourData.reserveUSD = pair.reserveUSD
  pairHourData.hourlyTxns = pairHourData.hourlyTxns.plus(ONE_BI)

  return pairHourData as PairHourData
}
*/

export function updateTokenDayData(token: Token, event: ethereum.Event, bundle: Bundle): TokenDayData {
  let timestamp = event.block.timestamp.toI32()
  let dayID = timestamp / 86400
  let dayStartTimestamp = dayID * 86400
  let tokenDayID = token.id
    .toString()
    .concat('-')
    .concat(BigInt.fromI32(dayID).toString())

  let tokenDayData = TokenDayData.load(tokenDayID)
  if (tokenDayData === null) {
    tokenDayData = new TokenDayData(tokenDayID)
    tokenDayData.token = token.id
    tokenDayData.date = dayStartTimestamp
    tokenDayData.dailyVolumeToken = ZERO_BD
    tokenDayData.dailyVolumeETH = ZERO_BD
    tokenDayData.dailyVolumeUSD = ZERO_BD
    tokenDayData.dailyTxns = ZERO_BI
    tokenDayData.totalLiquidityUSD = ZERO_BD
    tokenDayData.priceUSD = token.derivedETH.times(bundle.ethPrice)
  }
  tokenDayData.priceUSD = token.derivedETH.times(bundle.ethPrice)
  tokenDayData.totalLiquidityToken = token.totalLiquidity
  tokenDayData.totalLiquidityETH = token.totalLiquidity.times(token.derivedETH as BigDecimal)
  tokenDayData.totalLiquidityUSD = tokenDayData.totalLiquidityETH.times(bundle.ethPrice)
  tokenDayData.dailyTxns = tokenDayData.dailyTxns.plus(ONE_BI)

  /**
   * @todo test if this speeds up sync
   */
  // updateStoredTokens(tokenDayData as TokenDayData, dayID)
  // updateStoredPairs(tokenDayData as TokenDayData, dayPairID)

  return tokenDayData as TokenDayData
}
