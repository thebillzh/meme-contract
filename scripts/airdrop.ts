/* eslint-disable no-console */
import { Command } from "commander";
import { existsSync } from "fs";
import { resolve } from "path";
import { createWalletClient, getContract, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { MemeTokenWillGoToZeroABI, MemeTokenWillGoToZeroAddress } from "./abi";

import dotenv from "dotenv";
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
  .option(
    "-p --path <filepath>",
    "Path to the airdrop address and amount pairs json file."
  )
  .action(async (cliOptions) => {
    const providerUrl = process.env.PROVIDER_URL;
    if (!providerUrl) {
      throw new Error(`Missing provider url`);
    }
    const walletClient = createWalletClient({
      chain: process.env.NETWORK === "1" ? mainnet : sepolia,
      transport: http(process.env.PROVIDER_URL),
    });

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(`Missing private key`);
    }
    const account = privateKeyToAccount(`0x${privateKey}`);

    if (!cliOptions.path.endsWith(".json")) {
      throw new Error(
        `Airdrop address and amount pairs file ${cliOptions.path} must be a .json file`
      );
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!existsSync(resolve(cliOptions.path))) {
      throw new Error(
        `Airdrop address and amount pairs file ${cliOptions.path} does not exist`
      );
    }

    const targets: { address: `0x${string}`; amount: string }[] = (
      await import(resolve(cliOptions.path))
    ).default;

    const contract = getContract({
      abi: MemeTokenWillGoToZeroABI,
      address: MemeTokenWillGoToZeroAddress,
      walletClient,
    });
    const hash = await contract.write.batchAirdrop(
      [targets.map((p) => p.address), targets.map((p) => BigInt(p.amount))],
      {
        account,
      }
    );
    const totalAmount = targets.reduce(
      (acc, cur) => acc + BigInt(cur.amount),
      BigInt(0)
    );
    console.log(
      `Airdropped ${targets.length} addresses and ${totalAmount} tokens, transaction hash: ${hash}`
    );
  });

app.parse(process.argv);
