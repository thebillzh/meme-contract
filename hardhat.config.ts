import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-foundry";

import dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.23",
  networks: {
    mainnet: {
      url: process.env.MAINNET_PROVIDER_URL,
      accounts: [process.env.MAINNET_PRIVATE_KEY ?? ""],
    },
    sepolia: {
      url: process.env.SEPOLIA_PROVIDER_URL,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY ?? ""],
    },
    hardhat: {
      forking: {
        enabled: true,
        url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      },
    },
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  sourcify: {},
};

export default config;
