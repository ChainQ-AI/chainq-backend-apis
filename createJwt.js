const TronWeb = require("tronweb");
// const tronProApiKey = process.env.TRON_PRO_API_KEY;
// const privateKey = process.env.PRIVATE_KEY;
// const tronRpcUrl = process.env.TRON_RPC_QN_URL;

// const tronWeb = new TronWeb({
//   fullHost: "https://api.trongrid.io",
//   headers: { "TRON-PRO-API-KEY": tronProApiKey },
//   privateKey: privateKey,
// });

const verify = TronWeb.Trx.verifyMessageV2(
  "hello",
  "0xf5dfcac6e6dd02bab7308034495d061c10528ebdc64a0e474c65b97f069e85234eca55d7be45c05b6c047ca486df73b2ae41a5517168e6ebbed62d003e0da5541b"
);
console.log(verify);
