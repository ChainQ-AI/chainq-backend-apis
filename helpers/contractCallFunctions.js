const dotenv = require("dotenv");
dotenv.config();
const { createPublicClient, http } = require("viem");
const chainq_abi = require("../artifacts/chainq_abi.json").abi;
const scrollSepolia = require("viem/chains");

// preload and process in local
const RPC_URL = process.env.NODE_RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

const transport = http(RPC_URL);
const client = createPublicClient({
  chain: scrollSepolia,
  transport: transport,
});

async function callContractFunction(functionName, args) {
  try {
    const result = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: chainq_abi,
      functionName: functionName,
      args: args,
    });

    return result;
  } catch (error) {
    console.error("Error:", error);
    return error;
  }
}

module.exports = callContractFunction;
