import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import { exponentToBigDecimal, safeDiv } from '../utils/index'
import { Pool, Token } from '../../generated/schema'
import { ADDRESS_ZERO, ONE_BD, ZERO_BD, ZERO_BI } from './constants'

const Q192 = BigInt.fromI32(2).pow(192 as u8)
export function sqrtPriceX96ToTokenPrices(
  sqrtPriceX96: BigInt,
  token0: Token,
  token1: Token
): BigDecimal[] {
  const token0Decimals = token0.decimals
  const token1Decimals = token1.decimals

  const num = sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()
  const denom = BigDecimal.fromString(Q192.toString())
  const price1 = num.div(denom).times(exponentToBigDecimal(token0Decimals)).div(exponentToBigDecimal(token1Decimals))

  const price0 = safeDiv(BigDecimal.fromString('1'), price1)
  // return [price0, price1]
  return [price1, price0];

}

export function getNativePriceInUSD(stablecoinWrappedNativePoolId: string, stablecoinIsToken0: boolean): BigDecimal {
  const stablecoinWrappedNativePool = Pool.load(stablecoinWrappedNativePoolId)
  if (stablecoinWrappedNativePool !== null) {
    return stablecoinIsToken0 ? stablecoinWrappedNativePool.token0Price : stablecoinWrappedNativePool.token1Price
  } else {
    return ZERO_BD
  }
}

/**
 * Search through graph to find derived base token (tLTC) per token.
 **/
export function findNativePerToken(
  token: Token,
  wrappedNativeAddress: string,
  stablecoinAddresses: string[],
): BigDecimal {
  const whiteList = token.whitelistPools
  const stablecoins = stablecoinAddresses.map<string>(a => a.toLowerCase())

  if (token.id == wrappedNativeAddress || token.id == ADDRESS_ZERO) {
    return ONE_BD
  }

  let bestPrice = ZERO_BD
  let largestTVL = ZERO_BD

  if (stablecoins.includes(token.id)) {
    return ONE_BD
  }

  for (let i = 0; i < whiteList.length; ++i) {
    const poolAddress = whiteList[i]
    const pool = Pool.load(poolAddress)

    if (pool) {
      if (pool.token0 == token.id) {
        const isDirectBasePair = pool.token1 == wrappedNativeAddress || pool.token1 == ADDRESS_ZERO
        if (isDirectBasePair) {
          if (pool.token0Price.gt(ZERO_BD)) {
            const poolTVL = pool.totalValueLockedToken1.gt(ZERO_BD)
              ? pool.totalValueLockedToken1
              : pool.totalValueLockedToken0
            if (poolTVL.ge(largestTVL) || bestPrice.equals(ZERO_BD)) {
              largestTVL = poolTVL
              bestPrice = pool.token0Price
            }
          }
        } else {
          const token1 = Token.load(pool.token1)
          if (token1) {
            let token1Price = token1.derivedUSDC
            if (token1.id == wrappedNativeAddress || token1.id == ADDRESS_ZERO || stablecoins.includes(token1.id)) {
              token1Price = ONE_BD
            }
            if (token1Price.gt(ZERO_BD) && pool.token0Price.gt(ZERO_BD)) {
              const candidatePrice = pool.token0Price.times(token1Price)
              if (bestPrice.equals(ZERO_BD)) {
                bestPrice = candidatePrice
              }
            }
          }
        }
      } else if (pool.token1 == token.id) {
        const isDirectBasePair = pool.token0 == wrappedNativeAddress || pool.token0 == ADDRESS_ZERO
        if (isDirectBasePair) {
          if (pool.token1Price.gt(ZERO_BD)) {
            const poolTVL = pool.totalValueLockedToken0.gt(ZERO_BD)
              ? pool.totalValueLockedToken0
              : pool.totalValueLockedToken1
            if (poolTVL.ge(largestTVL) || bestPrice.equals(ZERO_BD)) {
              largestTVL = poolTVL
              bestPrice = pool.token1Price
            }
          }
        } else {
          const token0 = Token.load(pool.token0)
          if (token0) {
            let token0Price = token0.derivedUSDC
            if (token0.id == wrappedNativeAddress || token0.id == ADDRESS_ZERO || stablecoins.includes(token0.id)) {
              token0Price = ONE_BD
            }
            if (token0Price.gt(ZERO_BD) && pool.token1Price.gt(ZERO_BD)) {
              const candidatePrice = pool.token1Price.times(token0Price)
              if (bestPrice.equals(ZERO_BD)) {
                bestPrice = candidatePrice
              }
            }
          }
        }
      }
    }
  }
  return bestPrice
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedAmountUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  whitelistTokens: string[],
): BigDecimal {

  const price0USD = token0.derivedUSDC
  const price1USD = token1.derivedUSDC

  // both are whitelist tokens, return sum of both amounts
  if (whitelistTokens.includes(token0.id) && whitelistTokens.includes(token1.id)) {
    return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD))
  }

  // take double value of the whitelisted token amount
  if (whitelistTokens.includes(token0.id) && !whitelistTokens.includes(token1.id)) {
    return tokenAmount0.times(price0USD).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!whitelistTokens.includes(token0.id) && whitelistTokens.includes(token1.id)) {
    return tokenAmount1.times(price1USD).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked amount is 0
  return ZERO_BD
}

export function calculateAmountUSD(
  amount0: BigDecimal,
  amount1: BigDecimal,
  token0DerivedUSDC: BigDecimal,
  token1DerivedUSDC: BigDecimal,
): BigDecimal {
  return amount0.times(token0DerivedUSDC).plus(amount1.times(token1DerivedUSDC))
}
