'use strict';

const handler = require('../../../lib/handler');
const dynamodb = require('../../../utils/dynamoDb');
const { v4: uuidv4 } = require('uuid');

const db = dynamodb.doc;

const saveTvl = async (data) => {
  const params = {
    TableName: 'historicTvl',
    Item: data,
  };
  await db
    .put(params)
    .promise()
    .catch((err) => console.log('err', err));
};

const getHoldings = async () => {
  const params = {
    TableName: 'holdings',
  };
  const entries = await db.scan(params).promise();
  const holdings = entries.Items;

  return holdings;
};

const calcTvl = async () => {
  let tvl = 0;
  const holdings = await getHoldings();
  let totalVaultHoldings = 0;
  let totalStrategyHoldings = 0;
  let totalPoolBalanceUSD = 0;
  let stakedYFI = 0;
  let veCRV = 0;
  let doubleCountedVaults = 0;
  let holding;

  // eslint-disable-next-line no-restricted-syntax
  for (holding in holdings) {
    if (holding) {
      // calculating totalVaultHoldings and totalStrategyHoldings as defined in the link: services/tvl/TVL-readme.md
      if (holdings[holding].holdings) {
        totalVaultHoldings +=
          holdings[holding].holdings.vaultHoldings *
          holdings[holding].price_usd;
        totalStrategyHoldings +=
          holdings[holding].holdings.strategyHoldings *
          holdings[holding].price_usd;
        // removing strategy and vaults double counting.
        if (
          holdings[holding].name === 'DAI' ||
          holdings[holding].name === 'WETH' ||
          holdings[holding].name === 'TUSD' ||
          holdings[holding].name === 'USDT' ||
          holdings[holding].name === 'USD Coin' ||
          holdings[holding].name === 'yearn mStable USD'
        ) {
          totalVaultHoldings -=
            holdings[holding].holdings.strategyHoldings *
            holdings[holding].price_usd;
          totalStrategyHoldings -=
            holdings[holding].holdings.strategyHoldings *
            holdings[holding].price_usd;
        }

        // alink strategyholdings are already in USD, so no need to mnultiply by price_usd
        if (holdings[holding].name === 'aLINK') {
          totalVaultHoldings -= holdings[holding].holdings.strategyHoldings;
          totalStrategyHoldings -= holdings[holding].holdings.strategyHoldings;
        }
        if (holdings[holding].name === 'ChainLink') {
          totalVaultHoldings -=
            holdings[holding].holdings.vaultHoldings *
            holdings[holding].price_usd;
        }
      }

      // calculating Total earn products (poolBalanceUSD) as in the link: services/tvl/readme.md
      if (holdings[holding]) {
        if ('poolBalanceUSD' in holdings[holding]) {
          totalPoolBalanceUSD += holdings[holding].poolBalanceUSD;
        }
      }

      // calculating YFI staked on gov and veCRV locked finally using link:services/tvl/readme.md
      if (holdings[holding]) {
        if (holdings[holding].name === 'staked YFI') {
          stakedYFI +=
            holdings[holding].stakedYFI * holdings[holding].price_usd;
        }
        if (holdings[holding].name === 'veCRV') {
          veCRV += holdings[holding].veCRVLocked * holdings[holding].price_usd;
        }
      }

      // calculating double counted vaults for final TVL
      if (holdings[holding].holdings) {
        if (
          holdings[holding].name === 'yearn.finance' ||
          holdings[holding].name === 'curve.fi/busd LP' ||
          holdings[holding].name === 'curve.fi/y LP'
        ) {
          doubleCountedVaults +=
            holdings[holding].holdings.vaultHoldings *
            holdings[holding].price_usd;
        }
      }
    }
  }
  tvl =
    totalVaultHoldings +
    totalPoolBalanceUSD +
    stakedYFI +
    veCRV -
    doubleCountedVaults;
  console.log('totalVaultHoldings:', totalVaultHoldings);
  console.log('totalPoolBalanceUSD:', totalPoolBalanceUSD);
  console.log('totalStrategyHoldings:', totalStrategyHoldings);
  console.log('stakedYFI:', stakedYFI);
  console.log('veCRV:', veCRV);
  console.log('doubleCountedVaults:', doubleCountedVaults);

  const calculations = {
    totalVaultHoldings:
      'Sum of vaultHoldings from Holdings endpoint - DAI.strategyHoldings - WETH.strategyHoldings - TUSD.strategyHoldings - aLINK.strategyHoldings - USDT.strategyHoldings - USDC.strategyHoldings - LINK.vaultHoldings - mUSD.strategyHoldings',
    tvl:
      'totalVaultHoldings + yCRV.poolBalanceUSD + crvBUSD.poolBalanceUSD + yWBTC.PoolbalanceUSD + YFI.stakdYFI + veCRV.veVRCLocked - yCRV.vaultHoldings - crvBUSD.vaultHoldings - YFI.vaultHoldings',
  };
  const output = {
    TvlUSD: tvl,
    totalEarnHoldingsUSD: totalPoolBalanceUSD,
    totalVaultHoldingsUSD: totalVaultHoldings,
    timestamp: Date.now(),
    calculations,
    uuid: uuidv4(),
  };

  return output;
};

module.exports.handler = handler(async () => {
  const tvl = await calcTvl();
  await saveTvl(tvl);
  return tvl;
});
