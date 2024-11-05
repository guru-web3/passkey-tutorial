"use client";

import {
  KernelAccountClient,
  KernelSmartAccount,
  KernelValidator,
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  verifyEIP6492Signature,
} from "@zerodev/sdk";
import {
  WebAuthnMode,
  toPasskeyValidator,
  toWebAuthnKey,
} from "@zerodev/passkey-validator";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { bundlerActions, ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import React, { useEffect, useState } from "react";
import {
  createPublicClient,
  http,
  parseAbi,
  encodeFunctionData,
  zeroAddress,
  hashMessage,
  Address,
  Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  signerToEcdsaValidator,
  getValidatorAddress,
} from "@zerodev/ecdsa-validator";
import {
  createWeightedECDSAValidator,
  getRecoveryAction,
} from "@zerodev/weighted-ecdsa-validator";

export const ZERODEV_PROJECT_ID_SEPOLIA =
  "ddf3ddac-ac6e-492c-8e58-214c7e9f0e01";
export const ZERODEV_PROJECT_ID_AMOY = "779a8e75-8332-4e4f-b6e5-acfec9f777d9";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// @dev add your BUNDLER_URL, PAYMASTER_URL, and PASSKEY_SERVER_URL here
const BUNDLER_URL =
  "https://rpc.zerodev.app/api/v2/bundler/ddf3ddac-ac6e-492c-8e58-214c7e9f0e01";
const PAYMASTER_URL =
  "https://rpc.zerodev.app/api/v2/paymaster/ddf3ddac-ac6e-492c-8e58-214c7e9f0e01";
const PASSKEY_SERVER_URL =
  "https://passkeys.zerodev.app/api/v3/ddf3ddac-ac6e-492c-8e58-214c7e9f0e01";
const PRIVATE_KEY = `0xfb18b5165bf59aa5486d1e28eb2e6daa8e1da143a30a2f1c230d40802060fb60`;
const recoveryExecutorFunction =
  "function doRecovery(address _validator, bytes calldata _data)";

const CHAIN = sepolia;

const contractAddress = "0x34bE7f35132E97915633BC1fc020364EA5134863";
const contractABI = parseAbi([
  "function mint(address _to) public",
  "function balanceOf(address owner) external view returns (uint256 balance)",
]);

const publicClient = createPublicClient({
  transport: http(BUNDLER_URL),
});

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [accountAddress, setAccountAddress] = useState("");
  const [isKernelClientReady, setIsKernelClientReady] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSendingUserOp, setIsSendingUserOp] = useState(false);
  const [userOpHash, setUserOpHash] = useState("");
  const [userOpStatus, setUserOpStatus] = useState("");

  const createAccountAndClient = async (
    passkeyValidator: KernelValidator<any, "WebAuthnValidator"> & {
      getSerializedData: () => string;
    },
    dummyPasskeyValidator: KernelValidator<any, "WebAuthnValidator"> & {
      getSerializedData: () => string;
    }
  ) => {
    // guardian code
    const guardian = privateKeyToAccount(PRIVATE_KEY);
    const tempSigner = privateKeyToAccount(generatePrivateKey());

    const guardianValidator = await signerToEcdsaValidator(publicClient, {
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      signer: guardian,
      kernelVersion: KERNEL_V3_1,
    });
    // regular code
    const kernelAccount = await createKernelAccount(publicClient, {
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      plugins: {
        sudo: passkeyValidator,
        regular: guardianValidator,
        action: getRecoveryAction(ENTRYPOINT_ADDRESS_V07),
      },
      kernelVersion: KERNEL_V3_1,
    });

    const kernelClient = createKernelAccountClient({
      account: kernelAccount,
      chain: CHAIN,
      bundlerTransport: http(BUNDLER_URL),
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      middleware: {
        sponsorUserOperation: async ({ userOperation }) => {
          const zeroDevPaymaster = await createZeroDevPaymasterClient({
            chain: CHAIN,
            transport: http(PAYMASTER_URL),
            entryPoint: ENTRYPOINT_ADDRESS_V07,
          });
          return zeroDevPaymaster.sponsorUserOperation({
            userOperation,
            entryPoint: ENTRYPOINT_ADDRESS_V07,
          });
        },
      },
    });
    console.log("Kernel account created: ", kernelAccount.address);
    const signature = await passkeyValidator.signTypedData(await kernelAccount.kernelPluginManager.getPluginsEnableTypedData(kernelAccount.address));


    setIsKernelClientReady(true);
    setAccountAddress(kernelAccount.address);
    

    // // different chain recovery 
    // const recoveryAccount = await createKernelAccount(publicClient, {
    //   entryPoint: ENTRYPOINT_ADDRESS_V07,
    //   plugins: {
    //     regular: guardianValidator,
    //     action: getRecoveryAction(ENTRYPOINT_ADDRESS_V07),
    //   },
    //   deployedAccountAddress: kernelAccount.address,
    //   kernelVersion: KERNEL_V3_1,
    // });

    // console.log("Kernel account created: ", kernelAccount.address);

    // const recoveryClient = createKernelAccountClient({
    //   account: recoveryAccount,
    //   chain: CHAIN,
    //   bundlerTransport: http(BUNDLER_URL),
    //   entryPoint: ENTRYPOINT_ADDRESS_V07,
    //   middleware: {
    //     sponsorUserOperation: async ({ userOperation }) => {
    //       const zeroDevPaymaster = await createZeroDevPaymasterClient({
    //         chain: CHAIN,
    //         transport: http(PAYMASTER_URL),
    //         entryPoint: ENTRYPOINT_ADDRESS_V07,
    //       });
    //       return zeroDevPaymaster.sponsorUserOperation({
    //         userOperation,
    //         entryPoint: ENTRYPOINT_ADDRESS_V07,
    //       });
    //     },
    //   },
    // });
    
    // console.log(recoveryAccount.kernelPluginManager.signUserOperationWithActiveValidator());
    dummyPasskeyValidator.getEnableData = passkeyValidator.getEnableData;
    const dummySudo = {
      ...dummyPasskeyValidator,
      ...{
          address: passkeyValidator.address,
          // getIdentifier: ecdsaValidator.getIdentifier,
          // getEnableData: ecdsaValidator.getEnableData,
          getDummySignature: async (userOperation: any, pluginEnableSignature: any) => {
              return Promise.resolve("0x0000000000000000000000000000000000000000000000000000000000000000" as Hex);
            },
          // getEnableData: async (address) => {
          //     return ecdsaValidator.address;
          // },
          // getEnableData: async () => {
          //     return ecdsaValidator.address;
          // },
          // getNonceKey: dummyValidator.getNonceKey,
          // nonceManager: dummyValidator.nonceManager,

          sign: async () => {
              return Promise.resolve("0x0000000000000000000000000000000000000000000000000000000000000000" as Hex);
          },
          signMessage : async () => {
              return Promise.resolve("0x0000000000000000000000000000000000000000000000000000000000000000" as Hex);
          },
          signTransaction : async () => {
              return Promise.resolve("0x0000000000000000000000000000000000000000000000000000000000000000" as Hex);
          },
          signTypedData : async () => {
              return Promise.resolve("0x0000000000000000000000000000000000000000000000000000000000000000" as Hex);
          },
          signUserOperation : async () => {
              return Promise.resolve("0x0000000000000000000000000000000000000000000000000000000000000000" as Hex);
          },
      },
  };
    const kernelEnableRegularPluginAccount = await createKernelAccount(publicClient, {
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      plugins: {
        sudo: dummySudo,
        regular: guardianValidator,
        action: getRecoveryAction(ENTRYPOINT_ADDRESS_V07),
        pluginEnableSignature: signature,
      },
      deployedAccountAddress: kernelAccount.address,
      kernelVersion: KERNEL_V3_1,
    });

    const kernelEnableRegularPluginClient = createKernelAccountClient({
      account: kernelEnableRegularPluginAccount,
      chain: CHAIN,
      bundlerTransport: http(BUNDLER_URL),
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      middleware: {
        sponsorUserOperation: async ({ userOperation }) => {
          const zeroDevPaymaster = await createZeroDevPaymasterClient({
            chain: CHAIN,
            transport: http(PAYMASTER_URL),
            entryPoint: ENTRYPOINT_ADDRESS_V07,
          });
          return zeroDevPaymaster.sponsorUserOperation({
            userOperation,
            entryPoint: ENTRYPOINT_ADDRESS_V07,
          });
        },
      },
    });
    
    const paymasterClient = createZeroDevPaymasterClient({
      chain: sepolia,
      transport: http(PAYMASTER_URL),
      entryPoint: ENTRYPOINT_ADDRESS_V07,
    });
  
    const kernelClientWithoutAccount = createKernelAccountClient({
      chain: CHAIN,
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      bundlerTransport: http(BUNDLER_URL),
      middleware: {
        sponsorUserOperation: paymasterClient.sponsorUserOperation,
      },
    });

    console.log("Sending Userop: ", kernelAccount.address);
    await handleSendUserOp(kernelEnableRegularPluginClient, kernelEnableRegularPluginAccount);
    console.log("User Op Completed");

    console.log("performing recovery...", kernelEnableRegularPluginClient.account.address);
    const userOpHash = await kernelClientWithoutAccount.sendUserOperation({
      account: kernelEnableRegularPluginAccount,
      userOperation: {
        callData: encodeFunctionData({
          abi: parseAbi([recoveryExecutorFunction]),
          functionName: "doRecovery",
          args: [
            getValidatorAddress(ENTRYPOINT_ADDRESS_V07, KERNEL_V3_1),
            // "0xbA45a2BFb8De3D24cA9D7F1B551E14dFF5d690Fd",
            tempSigner.address,
          ],
        }),
      },
    });
  
    console.log("recovery userOp hash:", userOpHash);

    // await sleep(10000);

    const bundlerClient = kernelClient.extend(
      bundlerActions(ENTRYPOINT_ADDRESS_V07)
    );
    await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 100000,
    });
    console.log("recovery userOp hash:", userOpHash);

  };

  // Function to be called when "Register" is clicked
  const handleRegister = async () => {
    setIsRegistering(true);

    const updatedUserName = username || "Web3pay" + " - " + new Date().toISOString();
    const updatedUserName2 = username || "Web3pay dummy" + " - " + new Date().toISOString();
    const webAuthnKey = await toWebAuthnKey({
      passkeyName: updatedUserName,
      passkeyServerUrl: PASSKEY_SERVER_URL,
      mode: WebAuthnMode.Register,
    });
    const webAuthnKey2 = await toWebAuthnKey({
      passkeyName: updatedUserName2,
      passkeyServerUrl: PASSKEY_SERVER_URL,
      mode: WebAuthnMode.Register,
    });

    const passkeyValidator = await toPasskeyValidator(publicClient, {
      webAuthnKey,
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      kernelVersion: KERNEL_V3_1,
    });
    const dummyPasskeyValidator = await toPasskeyValidator(publicClient, {
      webAuthnKey: webAuthnKey2,
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      kernelVersion: KERNEL_V3_1,
    });

    await createAccountAndClient(passkeyValidator, dummyPasskeyValidator);

    setIsRegistering(false);
    window.alert("Register done.  Try sending UserOps.");
  };

  const handleLogin = async (kernelClient: any) => {
    setIsLoggingIn(true);
    const updatedUserName = username || "Web3pay" + " - " + new Date().toISOString();
    const webAuthnKey = await toWebAuthnKey({
      passkeyName: updatedUserName,
      passkeyServerUrl: PASSKEY_SERVER_URL,
      mode: WebAuthnMode.Login,
    });

    const passkeyValidator = await toPasskeyValidator(publicClient, {
      webAuthnKey,
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      kernelVersion: KERNEL_V3_1,
    });

    // await createAccountAndClient(passkeyValidator);

    setIsLoggingIn(false);
    window.alert("Login done.  Try sending UserOps.");
  };

  // Function to be called when "Login" is clicked
  const handleSendUserOp = async (
    kernelClient: any,
    kernelAccount: any,
  ) => {
    setIsSendingUserOp(true);
    setUserOpStatus("Sending UserOp...");

    const userOpHash = await kernelClient.sendUserOperation({
      account: kernelAccount,
      userOperation: {
        callData: await kernelAccount.encodeCallData({
          to: contractAddress,
          value: BigInt(0),
          data: encodeFunctionData({
            abi: contractABI,
            functionName: "mint",
            args: [kernelAccount.address],
          }),
        }),
      },
    });

    setUserOpHash(userOpHash);

    const bundlerClient = kernelClient.extend(
      bundlerActions(ENTRYPOINT_ADDRESS_V07)
    );
    await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 100000,
    });

    // Update the message based on the count of UserOps
    const userOpMessage = `UserOp completed. <a href="https://jiffyscan.xyz/userOpHash/${userOpHash}?network=mumbai" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700">Click here to view.</a>`;

    setUserOpStatus(userOpMessage);
    setIsSendingUserOp(false);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <></>;

  // Spinner component for visual feedback during loading states
  const Spinner = () => (
    <svg
      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );

  return (
    <main className="flex items-center justify-center min-h-screen px-4 py-24">
      <div className="w-full max-w-lg mx-auto">
        <h1 className="text-4xl font-semibold text-center mb-12">
          ZeroDev Passkeys Demo
        </h1>

        <div className="space-y-4">
          {/* Account Address Label */}
          {accountAddress && (
            <div className="text-center mb-4">
              Account address:{" "}
              <a
                href={`https://jiffyscan.xyz/account/${accountAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700"
              >
                {" "}
                {accountAddress}{" "}
              </a>
            </div>
          )}

          {/* Input Box */}
          <input
            type="text"
            placeholder="Your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg w-full"
          />

          {/* Register and Login Buttons */}
          <div className="flex flex-col sm:flex-row sm:space-x-4">
            {/* Register Button */}
            <button
              onClick={handleRegister}
              disabled={isRegistering || isLoggingIn}
              className="flex justify-center items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 w-full"
            >
              {isRegistering ? <Spinner /> : "Register"}
            </button>

            {/* Login Button */}
            <button
              onClick={handleLogin}
              disabled={isLoggingIn || isRegistering}
              className="mt-2 sm:mt-0 flex justify-center items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 w-full"
            >
              {isLoggingIn ? <Spinner /> : "Login"}
            </button>
          </div>

          {/* Send UserOp Button */}
          <div className="flex flex-col items-center w-full">
            <button
              onClick={handleSendUserOp}
              disabled={!isKernelClientReady || isSendingUserOp}
              className={`px-4 py-2 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50 flex justify-center items-center w-full ${
                isKernelClientReady && !isSendingUserOp
                  ? "bg-green-500 hover:bg-green-700 focus:ring-green-500"
                  : "bg-gray-500"
              }`}
            >
              {isSendingUserOp ? <Spinner /> : "Send UserOp"}
            </button>
            {/* UserOp Status Label */}
            {userOpHash && (
              <div
                className="mt-4"
                dangerouslySetInnerHTML={{
                  __html: userOpStatus,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
