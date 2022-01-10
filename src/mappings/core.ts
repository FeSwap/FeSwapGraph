/* eslint-disable prefer-const */
import { BigInt, BigDecimal, store, Address } from '@graphprotocol/graph-ts'
import {
  Pair,
  Token,
  FeSwapFactory,
  Transaction,
  Mint as MintEvent,
  Burn as BurnEvent,
  Swap as SwapEvent,
  Bundle
} from '../types/schema'
import { Pair as PairContract, Mint, Burn, Swap, Transfer, Sync, InitializeCall } from '../types/templates/Pair/Pair'
import { updatePairDayData, updateTokenDayData, updateFeSwapDayData, updatePairHourData } from './dayUpdates'
import { getEthPriceInUSD, findEthPerToken, getTrackedVolumeUSD, getTrackedLiquidityUSD, USDC_WETH_PAIR, WETH_USDC_PAIR } from './pricing'
import {
  convertTokenToDecimal,
  ADDRESS_ZERO,
  ADDRESS_MAX,
  FACTORY_ADDRESS,
  ONE_BI,
  ZERO_BI,
//createUser,
  createLiquidityPosition,
  ZERO_BD,
  BI_18,
  createLiquiditySnapshot
} from './helpers'

function isCompleteMint(mintId: string): boolean {
  return MintEvent.load(mintId)!.sender !== null // sufficient checks
}

/*
export function handleInitialize(call: InitializeCall): void {
  let pair = Pair.load(call.to.toHexString())!
  if (call.inputs._pairOwner.toHexString() !== ADDRESS_MAX) {
    pair.pairOwner = call.inputs._pairOwner
  }
  if (call.inputs.rateTrigger !== ZERO_BI) {
    pair.rateTrigger = call.inputs.rateTrigger.toI32()
  }
  pair.save()
} 
*/ 

export function handleTransfer(event: Transfer): void {
  // ignore initial transfers for first adds
  if (event.params.to.toHexString() == ADDRESS_ZERO && event.params.value.equals(BigInt.fromI32(1000))) {
    return
  }

  let feswapFactory = FeSwapFactory.load(FACTORY_ADDRESS)!
  let transactionHash = event.transaction.hash.toHexString()

  // user stats
  let from = event.params.from
//  createUser(from)
  let to = event.params.to
//  createUser(to)

  // get pair and load contract
  let pair = Pair.load(event.address.toHexString())!
  let pairContract = PairContract.bind(event.address)

  // liquidity token amount being transfered
  let value = convertTokenToDecimal(event.params.value, BI_18)

  // get or create transaction
  let transaction = Transaction.load(transactionHash)
  if (transaction === null) {
    transaction = new Transaction(transactionHash)
    transaction.blockNumber = event.block.number
    transaction.timestamp = event.block.timestamp
    transaction.mints = []
    transaction.burns = []
    transaction.swaps = []
  }

  // mints
  let mints = transaction.mints!
  if (from.toHexString() == ADDRESS_ZERO) {
    // update total supply
    pair.totalSupply = pair.totalSupply.plus(value)

    let mint: MintEvent
    // create new mint if no mints so far or if last one is done already
    if (mints.length === 0 || isCompleteMint(mints[mints.length - 1])) {
      mint = new MintEvent(
        event.transaction.hash
          .toHexString()
          .concat('-')
          .concat(BigInt.fromI32(mints.length).toString())
      )
      mint.transaction = transaction.id
      mint.timestamp = transaction.timestamp
      mint.pair = pair.id
      mint.save()

      // update mints in transaction
      mints.push(mint.id)
      transaction.mints = mints
      transaction.save()
    } else {
      // use the already created mint
      mint = MintEvent.load(mints[mints.length - 1])!
    }

//    if (to === changetype<Address>(feswapFactory.feeTo)) {
//      pair.profitProtocol = pair.profitProtocol.plus(value)
//    } else if (to === changetype<Address>(pair.pairOwner)) {
//      pair.profitPairOwner = pair.profitPairOwner.plus(value)
//    }

    mint.to = to
    mint.liquidity = value
    mint.save()
    pair.save()
  }

  // case where direct send first on ETH withdrawls
  if (event.params.to.toHexString() == pair.id) {
    let burns = transaction.burns!
    let burn = new BurnEvent(
      event.transaction.hash
        .toHexString()
        .concat('-')
        .concat(BigInt.fromI32(burns.length).toString())
    )
    
    burn.transaction = transaction.id
    burn.timestamp = transaction.timestamp
    burn.pair = pair.id
    burn.liquidity = value
    burn.to = event.params.to
    burn.sender = event.params.from
    burn.needsComplete = true
    burn.save()

    // TODO: Consider using .concat() for handling array updates to protect
    // against unintended side effects for other code paths.
    burns.push(burn.id)
    transaction.burns = burns
    transaction.save()
  }

  // burn
  if (event.params.to.toHexString() == ADDRESS_ZERO && event.params.from.toHexString() == pair.id) {
    pair.totalSupply = pair.totalSupply.minus(value)
    pair.save()

    // this is a new instance of a logical burn
    let burns = transaction.burns!
    let burn: BurnEvent
    if (burns.length > 0) {
      let currentBurn = BurnEvent.load(burns[burns.length - 1])!
      if (currentBurn.needsComplete) {
        burn = currentBurn as BurnEvent
        assert(burn.liquidity == value, "Not all liquidity burned");
      }
    }
    if (burn === null) {
      burn = new BurnEvent(
        event.transaction.hash
          .toHexString()
          .concat('-')
          .concat(BigInt.fromI32(burns.length).toString())
      )
      burn.transaction = transaction.id
      burn.timestamp = transaction.timestamp
      burn.pair = pair.id
      burn.liquidity = value
      burn.needsComplete = false
    }  

    // if this logical burn included a fee mint, account for this
    if (mints.length !== 0 && !isCompleteMint(mints[mints.length - 1])) {
      // remove the logical mint
      store.remove('Mint', mints[mints.length - 1])

      mints.pop()
      transaction.mints = mints
    }

    // if accessing last one, replace it
    if (burn.needsComplete) {
      burn.needsComplete = false
    } else {
      burns.push(burn.id)
      transaction.burns = burns
    }
    burn.save()
    transaction.save()
  }

  if (from.toHexString() != ADDRESS_ZERO && from.toHexString() != pair.id) {
    let fromUserLiquidityPosition = createLiquidityPosition(event.address, from)
    fromUserLiquidityPosition.liquidityTokenBalance = convertTokenToDecimal(pairContract.balanceOf(from), BI_18)
    fromUserLiquidityPosition.save()
    createLiquiditySnapshot(fromUserLiquidityPosition, event)
  }

  if (event.params.to.toHexString() != ADDRESS_ZERO && to.toHexString() != pair.id) {
    let toUserLiquidityPosition = createLiquidityPosition(event.address, to)
    toUserLiquidityPosition.liquidityTokenBalance = convertTokenToDecimal(pairContract.balanceOf(to), BI_18)
    toUserLiquidityPosition.save()
    createLiquiditySnapshot(toUserLiquidityPosition, event)
  }

  transaction.save()
}

export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address.toHexString())!
  let token0 = Token.load(pair.token0)!
  let token1 = Token.load(pair.token1)!
  let feswapFactory = FeSwapFactory.load(FACTORY_ADDRESS)!

  // reset factory liquidity by subtracting onluy tarcked liquidity
  feswapFactory.totalLiquidityETH = feswapFactory.totalLiquidityETH.minus(pair.trackedReserveETH as BigDecimal)

  // reset token total liquidity amounts
  token0.totalLiquidity = token0.totalLiquidity.minus(pair.reserve0)
  token1.totalLiquidity = token1.totalLiquidity.minus(pair.reserve1)

  pair.reserve0 = convertTokenToDecimal(event.params.reserve0, token0.decimals)
  pair.reserve1 = convertTokenToDecimal(event.params.reserve1, token1.decimals)

  if (pair.reserve1.notEqual(ZERO_BD)) pair.token0Price = pair.reserve0.div(pair.reserve1)
  else pair.token0Price = ZERO_BD
  if (pair.reserve0.notEqual(ZERO_BD)) pair.token1Price = pair.reserve1.div(pair.reserve0)
  else pair.token1Price = ZERO_BD

  // update ETH price now that reserves could have changed
  let bundle = Bundle.load('1')!
  if((pair.id == USDC_WETH_PAIR) || (pair.id == WETH_USDC_PAIR))
  {
    bundle.ethPrice = getEthPriceInUSD()
    bundle.save()
  }
  token0.derivedETH = findEthPerToken(token0 as Token)
  token1.derivedETH = findEthPerToken(token1 as Token)

  // get tracked liquidity - will be 0 if neither is in whitelist
  let trackedLiquidityETH: BigDecimal
  if (bundle.ethPrice.notEqual(ZERO_BD)) {
    trackedLiquidityETH = getTrackedLiquidityUSD(pair.reserve0, token0 as Token, pair.reserve1, token1 as Token, bundle as Bundle).div(
      bundle.ethPrice
    )
  } else {
    trackedLiquidityETH = ZERO_BD
  }

  // use derived amounts within pair
  pair.trackedReserveETH = trackedLiquidityETH
  pair.reserveETH = pair.reserve0
    .times(token0.derivedETH as BigDecimal)
    .plus(pair.reserve1.times(token1.derivedETH as BigDecimal))
  pair.reserveUSD = pair.reserveETH.times(bundle.ethPrice)

  // use tracked amounts globally
  feswapFactory.totalLiquidityETH = feswapFactory.totalLiquidityETH.plus(trackedLiquidityETH)
  feswapFactory.totalLiquidityUSD = feswapFactory.totalLiquidityETH.times(bundle.ethPrice)

  // now correctly set liquidity amounts for each token
  token0.totalLiquidity = token0.totalLiquidity.plus(pair.reserve0)
  token1.totalLiquidity = token1.totalLiquidity.plus(pair.reserve1)

  // save entities
  token0.save()
  token1.save()
  pair.save()
  feswapFactory.save()
}

export function handleMint(event: Mint): void {
  let transaction = Transaction.load(event.transaction.hash.toHexString())!
  let mints = transaction.mints!
  let mint = MintEvent.load(mints[mints.length - 1])!

  let pair = Pair.load(event.address.toHexString())!
  let feswapFactory = FeSwapFactory.load(FACTORY_ADDRESS)!

  // Pair owner is adding the liquidity, liquidity is mishandled as the Pairowner profit, do correction here.
//  if (mint.to === changetype<Address>(pair.pairOwner)) {
//    pair.profitPairOwner = pair.profitPairOwner.minus(mint.liquidity)
//  }

  let token0 = Token.load(pair.token0)!
  let token1 = Token.load(pair.token1)!

  // update exchange info (except balances, sync will cover that)
  let token0Amount = convertTokenToDecimal(event.params.amount0, token0.decimals)
  let token1Amount = convertTokenToDecimal(event.params.amount1, token1.decimals)

  // update txn counts
  token0.txCount = token0.txCount.plus(ONE_BI)
  token1.txCount = token1.txCount.plus(ONE_BI)

  // get new amounts of USD and ETH for tracking
  let bundle = Bundle.load('1')!
  let amountTotalUSD = token1.derivedETH
    .times(token1Amount)
    .plus(token0.derivedETH.times(token0Amount))
    .times(bundle.ethPrice)

  // update txn counts
  pair.txCount = pair.txCount.plus(ONE_BI)
  feswapFactory.txCount = feswapFactory.txCount.plus(ONE_BI)

  // save entities
  token0.save()
  token1.save()
  pair.save()
  feswapFactory.save()

  mint.sender = event.params.sender
  mint.amount0 = token0Amount as BigDecimal
  mint.amount1 = token1Amount as BigDecimal
  mint.logIndex = event.logIndex
  mint.amountUSD = amountTotalUSD as BigDecimal
  mint.save()

  // update the LP position
  let liquidityPosition = createLiquidityPosition(event.address, changetype<Address>(mint.to))
  createLiquiditySnapshot(liquidityPosition, event)

  // update day entities
  let feswapDayData = updateFeSwapDayData(feswapFactory as FeSwapFactory, event)
  let pairDayData   = updatePairDayData(pair as Pair, event)
  let pairHourData  = updatePairHourData(pair as Pair, event)
  let token0DayData = updateTokenDayData(token0 as Token, event,  bundle as Bundle)
  let token1DayData = updateTokenDayData(token1 as Token, event,  bundle as Bundle)

  feswapDayData.save()
  pairDayData.save()
  pairHourData.save()
  token0DayData.save()
  token1DayData.save()
}

export function handleBurn(event: Burn): void {
  let transaction = Transaction.load(event.transaction.hash.toHexString())

  // safety check
  if (transaction === null) {
    return
  }

  let burns = transaction.burns!
  let burn = BurnEvent.load(burns[burns.length - 1])!

  let pair = Pair.load(event.address.toHexString())!
  let feswapFactory = FeSwapFactory.load(FACTORY_ADDRESS)!

  //update token info
  let token0 = Token.load(pair.token0)!
  let token1 = Token.load(pair.token1)!
  let token0Amount = convertTokenToDecimal(event.params.amount0, token0.decimals)
  let token1Amount = convertTokenToDecimal(event.params.amount1, token1.decimals)

  // update txn counts
  token0.txCount = token0.txCount.plus(ONE_BI)
  token1.txCount = token1.txCount.plus(ONE_BI)

  // get new amounts of USD and ETH for tracking
  let bundle = Bundle.load('1')!
  let amountTotalUSD = token1.derivedETH
    .times(token1Amount)
    .plus(token0.derivedETH.times(token0Amount))
    .times(bundle.ethPrice)

  // update txn counts
  feswapFactory.txCount = feswapFactory.txCount.plus(ONE_BI)
  pair.txCount = pair.txCount.plus(ONE_BI)

  // update global counter and save
  token0.save()
  token1.save()
  pair.save()
  feswapFactory.save()

  // update burn
  // burn.sender = event.params.sender
  burn.amount0 = token0Amount as BigDecimal
  burn.amount1 = token1Amount as BigDecimal
  burn.to = event.params.to
  burn.logIndex = event.logIndex
  burn.amountUSD = amountTotalUSD as BigDecimal
  burn.save()

  // update the LP position
  let liquidityPosition = createLiquidityPosition(event.address, changetype<Address>(burn.sender))
  createLiquiditySnapshot(liquidityPosition, event)

  // update day entities
  let feswapDayData = updateFeSwapDayData(feswapFactory as FeSwapFactory, event)
  let pairDayData   = updatePairDayData(pair as Pair, event)
  let pairHourData  = updatePairHourData(pair as Pair, event)
  let token0DayData = updateTokenDayData(token0 as Token, event, bundle as Bundle)
  let token1DayData = updateTokenDayData(token1 as Token, event, bundle as Bundle)

  feswapDayData.save()
  pairDayData.save()
  pairHourData.save()
  token0DayData.save()
  token1DayData.save()
}

export function handleSwap(event: Swap): void {
  let pair = Pair.load(event.address.toHexString())!
  let token0 = Token.load(pair.token0)!
  let token1 = Token.load(pair.token1)!
  let amount0In = convertTokenToDecimal(event.params.amount0In, token0.decimals)
  let amount1In = convertTokenToDecimal(event.params.amount1In, token1.decimals)
  let amount1Out = convertTokenToDecimal(event.params.amount1Out, token1.decimals)

  // totals for volume updates
  let amount0Total = amount0In
  let amount1Total = amount1Out.plus(amount1In)

  // ETH/USD prices
  let bundle = Bundle.load('1')!

  // get total amounts of derived USD and ETH for tracking
  let derivedAmountETH = token1.derivedETH
    .times(amount1Total)
    .plus(token0.derivedETH.times(amount0Total))
    .div(BigDecimal.fromString('2'))
  let derivedAmountUSD = derivedAmountETH.times(bundle.ethPrice)

  // only accounts for volume through white listed tokens
  let trackedAmountUSD = getTrackedVolumeUSD(amount0Total, token0 as Token, amount1Total, token1 as Token, bundle as Bundle)

  let trackedAmountETH: BigDecimal
  if (bundle.ethPrice.equals(ZERO_BD)) {
    trackedAmountETH = ZERO_BD
  } else {
    trackedAmountETH = trackedAmountUSD.div(bundle.ethPrice)
  }

  // update token0 global volume and token liquidity stats
  token0.tradeVolume = token0.tradeVolume.plus(amount0Total)
  token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(trackedAmountUSD)
  token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(derivedAmountUSD)

  // update token1 global volume and token liquidity stats
  token1.tradeVolume = token1.tradeVolume.plus(amount1Total)
  token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(trackedAmountUSD)
  token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(derivedAmountUSD)

  // update txn counts
  token0.txCount = token0.txCount.plus(ONE_BI)
  token1.txCount = token1.txCount.plus(ONE_BI)

  // update pair volume data, use tracked amount if we have it as its probably more accurate
  pair.volumeUSD = pair.volumeUSD.plus(trackedAmountUSD)
  pair.volumeToken0 = pair.volumeToken0.plus(amount0Total)
  pair.volumeToken1 = pair.volumeToken1.plus(amount1Total)
  pair.untrackedVolumeUSD = pair.untrackedVolumeUSD.plus(derivedAmountUSD)
  pair.txCount = pair.txCount.plus(ONE_BI)

  // update global values, only used tracked amounts for volume
  let feswapFactory = FeSwapFactory.load(FACTORY_ADDRESS)!
  feswapFactory.totalVolumeUSD = feswapFactory.totalVolumeUSD.plus(trackedAmountUSD)
  feswapFactory.totalVolumeETH = feswapFactory.totalVolumeETH.plus(trackedAmountETH)
  feswapFactory.untrackedVolumeUSD = feswapFactory.untrackedVolumeUSD.plus(derivedAmountUSD)
  feswapFactory.txCount = feswapFactory.txCount.plus(ONE_BI)

  // save entities
  pair.save()
  token0.save()
  token1.save()
  feswapFactory.save()

  let transaction = Transaction.load(event.transaction.hash.toHexString())
  if (transaction === null) {
    transaction = new Transaction(event.transaction.hash.toHexString())
    transaction.blockNumber = event.block.number
    transaction.timestamp = event.block.timestamp
    transaction.mints = []
    transaction.swaps = []
    transaction.burns = []
  }

  let swaps = transaction.swaps!
  let swap = new SwapEvent(
    event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(BigInt.fromI32(swaps.length).toString())
  )

  // update swap event
  swap.transaction = transaction.id
  swap.timestamp = transaction.timestamp
  swap.pair = pair.id
  swap.sender = event.params.sender
  swap.from = event.transaction.from
  swap.amount0In = amount0In
  swap.amount1In = amount1In
  swap.amount1Out = amount1Out
  swap.to = event.params.to
  swap.logIndex = event.logIndex
  // use the tracked amount if we have it
  swap.amountUSD = (trackedAmountUSD === ZERO_BD) ? derivedAmountUSD : trackedAmountUSD
  swap.save()

  // update the transaction

  // TODO: Consider using .concat() for handling array updates to protect
  // against unintended side effects for other code paths.
  swaps.push(swap.id)
  transaction.swaps = swaps
  transaction.save()

  // update day entities
  let feswapDayData = updateFeSwapDayData(feswapFactory as FeSwapFactory, event)
  let pairDayData   = updatePairDayData(pair as Pair, event)
  let pairHourData  = updatePairHourData(pair as Pair, event)
  let token0DayData = updateTokenDayData(token0 as Token, event, bundle as Bundle)
  let token1DayData = updateTokenDayData(token1 as Token, event, bundle as Bundle)

  // swap specific updating
  feswapDayData.dailyVolumeETH = feswapDayData.dailyVolumeETH.plus(trackedAmountETH)
  feswapDayData.dailyVolumeUSD = feswapDayData.dailyVolumeUSD.plus(trackedAmountUSD)
  feswapDayData.dailyVolumeUntracked = feswapDayData.dailyVolumeUntracked.plus(derivedAmountUSD)
  feswapDayData.save()

  // swap specific updating for pair
  pairDayData.dailyVolumeToken0 = pairDayData.dailyVolumeToken0.plus(amount0Total)
  pairDayData.dailyVolumeToken1 = pairDayData.dailyVolumeToken1.plus(amount1Total)
  pairDayData.dailyVolumeUSD = pairDayData.dailyVolumeUSD.plus(trackedAmountUSD)
  pairDayData.save()

  // update hourly pair data
  pairHourData.hourlyVolumeToken0 = pairHourData.hourlyVolumeToken0.plus(amount0Total)
  pairHourData.hourlyVolumeToken1 = pairHourData.hourlyVolumeToken1.plus(amount1Total)
  pairHourData.hourlyVolumeUSD = pairHourData.hourlyVolumeUSD.plus(trackedAmountUSD)
  pairHourData.save()

  // swap specific updating for token0
  token0DayData.dailyVolumeToken = token0DayData.dailyVolumeToken.plus(amount0Total)
  token0DayData.dailyVolumeETH = token0DayData.dailyVolumeETH.plus(amount0Total.times(token0.derivedETH as BigDecimal))
  token0DayData.dailyVolumeUSD = token0DayData.dailyVolumeUSD.plus(
    amount0Total.times(token0.derivedETH as BigDecimal).times(bundle.ethPrice)
  )
  token0DayData.save()

  // swap specific updating
  token1DayData.dailyVolumeToken = token1DayData.dailyVolumeToken.plus(amount1Total)
  token1DayData.dailyVolumeETH = token1DayData.dailyVolumeETH.plus(amount1Total.times(token1.derivedETH as BigDecimal))
  token1DayData.dailyVolumeUSD = token1DayData.dailyVolumeUSD.plus(
    amount1Total.times(token1.derivedETH as BigDecimal).times(bundle.ethPrice)
  )
  token1DayData.save()
}
