/* eslint-disable prefer-const */
import { Transfer } from '../types/Fesw/Fesw'
import { MiningPool, Pool, MiningPosition } from '../types/schema'
import { StakingTwinRewards as StakingTwinRewardsTemplate  } from '../types/templates'
import { RewardAdded as RewardAddedEvent, Staked as StakedEvent, Withdrawn as WithdrawnEvent, 
          RewardPaid as RewardPaidEvent, StakingTwinRewards } from '../types/templates/StakingTwinRewards/StakingTwinRewards'
import { Pair as PairContract } from '../types/templates/StakingTwinRewards/Pair'

import {
  STAKING_FACTORY_ADDRESS,
  fetchTokenSymbol,
  ZERO_BD,
  BI_18,
  convertTokenToDecimal,
} from './helpers'

export function handleFeswTransfer(event: Transfer): void {
  // Check the staking reward notify events
  if (event.params.from.toHexString() !== STAKING_FACTORY_ADDRESS) return

  let pool = event.params.to.toHexString()
  let miningPool = MiningPool.load(pool)
  if(miningPool !== null) return
  miningPool = new MiningPool(pool)

  let stakingContract = StakingTwinRewards.bind(event.params.to)
  let stakingTokenA = stakingContract.stakingTokenA()
  let stakingTokenB = stakingContract.stakingTokenB()

  // create the staking pool of 1st liquidity token 
  let pairAAB =  new Pool(stakingTokenA.toHexString())
  let pairAABContract = PairContract.bind(stakingTokenA)
  pairAAB.token0 = fetchTokenSymbol(pairAABContract.tokenIn())
  pairAAB.token1 = fetchTokenSymbol(pairAABContract.tokenOut())
  pairAAB.save()

  // create the staking pool of 2nd liquidity token 
  let pairABB =  new Pool(stakingTokenB.toHexString())
  let pairContractABB = PairContract.bind(stakingTokenB)
  pairABB.token0 = fetchTokenSymbol(pairContractABB.tokenIn())
  pairABB.token1 = fetchTokenSymbol(pairContractABB.tokenOut())
  pairABB.save()

  miningPool.rewardRate = ZERO_BD
  miningPool.totalStaked0 = ZERO_BD
  miningPool.totalStaked1 = ZERO_BD
  miningPool.pair0 = pairAAB.id
  miningPool.pair1 = pairABB.id
  miningPool.save()

  // create the staking contract based on the template
  StakingTwinRewardsTemplate.create(event.params.to)
  return
}

export function handleRewardAdded(event: RewardAddedEvent): void {
  let pool = MiningPool.load(event.address.toHexString())!
  let stakingContract = StakingTwinRewards.bind(event.address)
  // get the rewardRate instead of calculating it
  pool.rewardRate = convertTokenToDecimal(stakingContract.rewardRate(), BI_18)
  pool.save()
}

export function handleStaked(event: StakedEvent): void {
  let pool = MiningPool.load(event.address.toHexString())!
  let user = event.params.user.toHexString()
  let positionID = user.concat('-').concat(pool.id)
  let miningPosition = MiningPosition.load(positionID)

  if (miningPosition === null) {
    miningPosition = new MiningPosition(positionID)
    miningPosition.miningPool = pool.id
    miningPosition.user = user
    miningPosition.claimedFESW = ZERO_BD
  }
  
  let token0Amount = convertTokenToDecimal(event.params.amountA, BI_18)
  let token1Amount = convertTokenToDecimal(event.params.amountB, BI_18)

  miningPosition.balance0 = miningPosition.balance0.plus(token0Amount)
  miningPosition.balance1 = miningPosition.balance1.plus(token1Amount)
  miningPosition.save()
  
  pool.totalStaked0 = pool.totalStaked0.plus(token0Amount)
  pool.totalStaked1 = pool.totalStaked1.plus(token1Amount)
  pool.save()
}

export function handleWithdrawn(event: WithdrawnEvent): void {
  let pool = MiningPool.load(event.address.toHexString())!
  let positionID = event.params.user
                    .toHexString()
                    .concat('-')
                    .concat(event.address.toHexString())
  let miningPosition = MiningPosition.load(positionID)!
 
  let token0Amount = convertTokenToDecimal(event.params.amountA, BI_18)
  let token1Amount = convertTokenToDecimal(event.params.amountB, BI_18)
  miningPosition.balance0 = miningPosition.balance0.minus(token0Amount)
  miningPosition.balance1 = miningPosition.balance1.minus(token1Amount)
  miningPosition.save()

  pool.totalStaked0 = pool.totalStaked0.minus(token0Amount)
  pool.totalStaked1 = pool.totalStaked1.minus(token1Amount)
  pool.save()
}

export function handleRewardPaid(event: RewardPaidEvent): void {
  let positionID = event.params.user
                    .toHexString()
                    .concat('-')
                    .concat(event.address.toHexString())
  let miningPosition = MiningPosition.load(positionID)!

  let reward = convertTokenToDecimal(event.params.reward, BI_18)
  miningPosition.claimedFESW = miningPosition.claimedFESW.minus(reward)
  miningPosition.save()
}
