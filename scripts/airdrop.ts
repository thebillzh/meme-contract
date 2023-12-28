/* eslint-disable no-console */
import { Command } from "commander";
import dotenv from "dotenv";
import { isAddress } from "ethers";
import { existsSync } from "fs";
import { ethers } from "hardhat";
import { resolve } from "path";
dotenv.config();

export const APP_VERSION = process.env["npm_package_version"] ?? "0.0.0";

const app = new Command();
app
  .name("airdrop")
  .description("Airdrop token to addresses")
  .version(APP_VERSION);

app
  .command("airdrop")
  .description("Airdrop token to target addresses")
  .option("-a --address <address>", "Address to the token contract.")
  .option(
    "-p --path <filepath>",
    "Path to the airdrop address and amount pairs json file."
  )
  .action(async (cliOptions) => {
    if (!isAddress(cliOptions.address)) {
      throw new Error(
        `Token contract address ${cliOptions.address} is invalid`
      );
    }
    const tokenAddress = cliOptions.address;

    if (!cliOptions.path.endsWith(".json")) {
      throw new Error(
        `Airdrop address and amount pairs file ${cliOptions.path} must be a .json file`
      );
    }
    const filePath = resolve(cliOptions.path);

    console.log(`Start airdropping`);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!existsSync(filePath)) {
      throw new Error(
        `Airdrop address and amount pairs file ${cliOptions.path} does not exist`
      );
    }

    const targets: { address: `0x${string}`; amount: string }[] = (
      await import(filePath)
    ).default;

    const contract = await ethers.getContractAt(
      "MemeTokenWillGoToZero",
      tokenAddress
    );
    const tx = await contract.batchAirdrop(
      targets.map((p) => p.address),
      targets.map((p) => BigInt(p.amount))
    );
    const totalAmount = targets.reduce(
      (acc, cur) => acc + BigInt(cur.amount),
      BigInt(0)
    );
    console.log(
      `Airdropped ${targets.length} addresses and ${totalAmount} tokens, transaction hash: ${tx.hash}`
    );
  });

app.parse(process.argv);
