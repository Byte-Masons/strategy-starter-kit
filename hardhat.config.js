require('hardhat-preprocessor');
require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();
require('@openzeppelin/hardhat-upgrades');
const fs = require('fs');

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const FTMSCAN_KEY = process.env.FTMSCAN_API_KEY;

function getRemappings() {
  return fs
    .readFileSync('remappings.txt', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.trim().split('='));
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    mainnet: {
      url: `https://rpc.ftm.tools`,
      chainId: 250,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    testnet: {
      url: `https://rpcapi-tracing.testnet.fantom.network`,
      chainId: 4002,
      accounts: [`0x${PRIVATE_KEY}`],
    },
  },
  etherscan: {
    apiKey: FTMSCAN_KEY,
  },
  mocha: {
    timeout: 1200000,
  },
  preprocess: {
    eachLine: (hre) => ({
      transform: (line) => {
        if (line.match(/^\s*import /i)) {
          getRemappings().forEach(([find, replace]) => {
            if (line.match(find)) {
              line = line.replace(find, replace);
            }
          });
        }
        return line;
      },
    }),
  },
};
