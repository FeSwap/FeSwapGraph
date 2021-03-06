/* eslint-disable prefer-const */
import { log, BigInt, BigDecimal, Address, ethereum } from '@graphprotocol/graph-ts'
import { ERC20 } from '../types/FeSwapFactory/ERC20'
import { ERC20SymbolBytes } from '../types/FeSwapFactory/ERC20SymbolBytes'
import { ERC20NameBytes } from '../types/FeSwapFactory/ERC20NameBytes'
import { User, Bundle, Token, LiquidityPosition, LiquidityPositionSnapshot, Pair, FeSwapFactory } from '../types/schema'
import { FeSwapFactory as FactoryContract } from '../types/templates/Pair/FeSwapFactory'
//import { TokenDefinition } from './tokenDefinition'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export const ADDRESS_MAX  = '0xffffffffffffffffffffffffffffffffffffffff'

// must be formatted to be identical to info app
export const FACTORY_ADDRESS = '0x91289e8150E20Ff7CA8478dAd6DCC55D5c85Ac2D'       
export const STAKE_POOL1_ADDRESS = '0xe05dbd3379fcfd8cf9288d690950ddc0141ceff4'
export const STAKE_POOL2_ADDRESS = '0xde7fa1fbc848452f03883b3b8a6aef0e81995ad0'
export const STAKING_FACTORY_ADDRESS = '0xe499ee63f5ad4b70f7931ab81bc8d8a8f8f2f66e'
export const INIT_CODE_HASH = '0x1b68a89c18551451d63580e66fda7aee3ccf09c7317f32b6747ff18b1173ad09'

export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)

export let factoryContract = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS))

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export function bigDecimalExp18(): BigDecimal {
  return BigDecimal.fromString('1000000000000000000')
}

export function convertEthToDecimal(eth: BigInt): BigDecimal {
  return eth.toBigDecimal().div(exponentToBigDecimal(18))
}

export function convertDecimalToBigInt(amountInDecimal: BigDecimal, exchangeDecimals: BigInt): BigInt {
  return BigInt.fromString(amountInDecimal.times(exponentToBigDecimal(exchangeDecimals)).toString())
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

export function equalToZero(value: BigDecimal): boolean {
  const formattedVal = parseFloat(value.toString())
  const zero = parseFloat(ZERO_BD.toString())
  if (zero == formattedVal) {
    return true
  }
  return false
}

export function isNullEthValue(value: string): boolean {
  return value == '0x0000000000000000000000000000000000000000000000000000000000000001'
}

export function fetchFactoryFeeTo(): Address {
  let contractFactory = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS))

  // try types string and bytes32 for symbol
  let feeToResult = contractFactory.try_feeTo()
  if (feeToResult.reverted) {
    return Address.fromString(ADDRESS_ZERO)
  }
  return feeToResult.value
}

export function fetchTokenSymbol(tokenAddress: Address): string {
  // static definitions overrides
//  let staticDefinition = TokenDefinition.fromAddress(tokenAddress)
//  if(staticDefinition != null) {
//    return (staticDefinition as TokenDefinition).symbol
//  }

  let contract = ERC20.bind(tokenAddress)
  let contractSymbolBytes = ERC20SymbolBytes.bind(tokenAddress)

  // try types string and bytes32 for symbol
  let symbolValue = 'unknown'
  let symbolResult = contract.try_symbol()
  if (symbolResult.reverted) {
    let symbolResultBytes = contractSymbolBytes.try_symbol()
    if (!symbolResultBytes.reverted) {
      // for broken pairs that have no symbol function exposed
      if (!isNullEthValue(symbolResultBytes.value.toHexString())) {
        symbolValue = symbolResultBytes.value.toString()
      }
    }
  } else {
    symbolValue = symbolResult.value
  }

  return symbolValue
}

export function fetchTokenName(tokenAddress: Address): string {
  // static definitions overrides
//  let staticDefinition = TokenDefinition.fromAddress(tokenAddress)
//  if(staticDefinition != null) {
//    return (staticDefinition as TokenDefinition).name
//  }

  let contract = ERC20.bind(tokenAddress)
  let contractNameBytes = ERC20NameBytes.bind(tokenAddress)

  // try types string and bytes32 for name
  let nameValue = 'unknown'
  let nameResult = contract.try_name()
  if (nameResult.reverted) {
    let nameResultBytes = contractNameBytes.try_name()
    if (!nameResultBytes.reverted) {
      // for broken exchanges that have no name function exposed
      if (!isNullEthValue(nameResultBytes.value.toHexString())) {
        nameValue = nameResultBytes.value.toString()
      }
    }
  } else {
    nameValue = nameResult.value
  }

  return nameValue
}

export function fetchTokenTotalSupply(tokenAddress: Address): BigInt {
  let contract = ERC20.bind(tokenAddress)
  let totalSupplyValue = BigInt.zero()
  let totalSupplyResult = contract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    totalSupplyValue = totalSupplyResult.value
  }
  return totalSupplyValue
}

export function fetchTokenDecimals(tokenAddress: Address): BigInt {
  // static definitions overrides
//  let staticDefinition = TokenDefinition.fromAddress(tokenAddress)
//  if(staticDefinition != null) {
//    return (staticDefinition as TokenDefinition).decimals
//  }

  let contract = ERC20.bind(tokenAddress)
  // try types uint8 for decimals
  let decimalValue = BigInt.zero()
  let decimalResult = contract.try_decimals()
  if (!decimalResult.reverted) {
    decimalValue = BigInt.fromI32(decimalResult.value)
  }
  return decimalValue
}

export function createLiquidityPosition(exchange: Address, user: Address): LiquidityPosition {
  let id = exchange
    .toHexString()
    .concat('-')
    .concat(user.toHexString())
  let liquidityPosition = LiquidityPosition.load(id)
  if (liquidityPosition === null) {
    let pair = Pair.load(exchange.toHexString())!
    pair.liquidityProviderCount = pair.liquidityProviderCount.plus(ONE_BI)
    liquidityPosition = new LiquidityPosition(id)
    liquidityPosition.user = user.toHexString()
    liquidityPosition.pair = exchange.toHexString()
    liquidityPosition.liquidityTokenBalance = ZERO_BD
    liquidityPosition.save()
    pair.save()
  }
  if (liquidityPosition === null) log.error('liquidityPosition is null', [id])
  return liquidityPosition as LiquidityPosition
}

export function createUser(address: Address): void {
  let user = User.load(address.toHexString())
  if (user === null) {
    user = new User(address.toHexString())
    user.usdSwapped = ZERO_BD
    user.save()
  }
}

export function createLiquiditySnapshot(position: LiquidityPosition, event: ethereum.Event): void {
  let timestamp = event.block.timestamp.toI32()
  let bundle = Bundle.load('1')!
  let pair = Pair.load(position.pair)!
  let token0 = Token.load(pair.token0)!
  let token1 = Token.load(pair.token1)!

  // create new snapshot
  let snapshot = new LiquidityPositionSnapshot(position.id.concat(timestamp.toString()))
  snapshot.liquidityPosition = position.id
  snapshot.timestamp = timestamp
  snapshot.block = event.block.number.toI32()
  snapshot.user = position.user
  snapshot.pair = position.pair
  snapshot.token0PriceUSD = token0.derivedETH.times(bundle.ethPrice)
  snapshot.token1PriceUSD = token1.derivedETH.times(bundle.ethPrice)
  snapshot.reserve0 = pair.reserve0
  snapshot.reserve1 = pair.reserve1
  snapshot.reserveUSD = pair.reserveUSD
  snapshot.liquidityTokenTotalSupply = pair.totalSupply
  snapshot.liquidityTokenBalance = position.liquidityTokenBalance

  snapshot.save()
}
