/* eslint-disable no-console */
import { ethers, upgrades } from "hardhat";

import dotenv from "dotenv";
import { exit } from "process";
dotenv.config();

const main = async () => {
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY ?? "");
  const MemeTokenWillGoToZero = await ethers.getContractFactory(
    "MemeTokenWillGoToZero"
  );
  console.log(`Start deploying`);

  const memeToken = await upgrades.deployProxy(
    MemeTokenWillGoToZero,
    [await wallet.getAddress()],
    {
      initializer: "initialize",
    }
  );
  const tx = memeToken.deploymentTransaction();
  if (tx) {
    console.log(`Deploying\ntransaction hash: ${tx.hash}`);
  }

  const contract = await memeToken.waitForDeployment();
  const proxyAddress = await contract.getAddress();

  console.log(
    `Deployed\nproxy address: ${proxyAddress}\nimpl address ${await upgrades.erc1967.getImplementationAddress(
      proxyAddress
    )}`
  );
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
