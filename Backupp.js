const TronWeb = require("tronweb");
const sqlite3 = require("sqlite3");
const dotenv = require("dotenv");
const fs = require("fs");

dotenv.config();

const tronProApiKey = process.env.TRON_PRO_API_KEY;
const privateKey = process.env.PRIVATE_KEY;
const tronRpcUrl = process.env.TRON_RPC_QN_URL;

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  headers: { "TRON-PRO-API-KEY": tronProApiKey },
  privateKey: privateKey,
});

const db = new sqlite3.Database(
  "tronData.db",
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  async (err) => {
    if (err) {
      console.error("Error opening database:", err.message);
    } else {
      console.log("Database opened");
      await initialize();
    }
  }
);

async function createTables() {
  return new Promise((resolve, reject) => {
    db.run(
      `
      CREATE TABLE IF NOT EXISTS blocks (
        blockHash TEXT PRIMARY KEY,
        parentHash TEXT,
        blockNumber INTEGER,
        timestamp TEXT,
        witnessAddress TEXT,
        version INTEGER,
        witnessSignature TEXT
      )
      `,
      (err) => {
        if (err) {
          reject(err);
        } else {
          console.log("Blocks table created");
          db.run(
            `
                CREATE TABLE IF NOT EXISTS transactions (
                    txID TEXT PRIMARY KEY,
                    blockHash TEXT,
                    blockNumber INTEGER,
                    fromAddress TEXT,
                    gasPrice INTEGER,
                    result TEXT,
                    input TEXT,
                    stakedAssetReleasedBalance INTEGER,
                    resource TEXT,
                    timestamp TEXT,
                    expiration TEXT,
                    toAddress TEXT,
                    amount REAL,
                    feeLimit REAL,
                    type TEXT,
                    ownerAddress TEXT,
                    contractAddress TEXT,
                    resourcesTakenFromAddress TEXT,
                    contractData TEXT
                  )
          `,
            (err) => {
              if (err) {
                reject(err);
              } else {
                console.log("Transactions table created");
                resolve();
              }
            }
          );
        }
      }
    );
  });
}

async function getLastIndex() {
  try {
    const result = await new Promise((resolve, reject) => {
      db.get(
        "SELECT MAX(blockNumber) AS maxBlockHeight FROM blocks",
        (err, result) => {
          if (err) {
            console.error("Error getting last index:", err);
            reject(err);
          } else {
            resolve(result);
          }
        }
      );
    });
    // console.log(result);
    const latestBlockHeight =
      result.maxBlockHeight !== null ? result.maxBlockHeight : 0;
    console.log("Latest block height:===", latestBlockHeight);
    if (latestBlockHeight >= 1) {
      console.log("Starting with block number:===", latestBlockHeight + 1);
    } else {
      console.log("Starting with block number:===" + 54075718);
    }
    return latestBlockHeight + 1;
  } catch (e) {
    console.error("Error getting last index:", e);
    return null;
  }
}

function convertUnixTimestamp(unixTimestamp) {
  const date = new Date(unixTimestamp);
  const options = { timeZone: "UTC" };
  const localDate = date.toLocaleString("en-US", options);
  return localDate;
}

const jsonDataArray = [];

async function listenToBlocks() {
  try {
    let blockNum = await getLastIndex();
    if (
      (blockNum !== 54075718 && blockNum == 0) ||
      blockNum == null ||
      blockNum == 1
    ) {
      blockNum = 54075718; // decided index to start fetching data from
    }

    let latestBlockHeight = await tronWeb.trx.getCurrentBlock();
    let latestBlockNumber = await latestBlockHeight.block_header.raw_data
      .number;

    while (true) {
      try {
        const block = await tronWeb.trx.getBlock(blockNum);
        async function processBlock(block) {
          try {
            const blockData = {
              blockHash: block.blockID,
              parentHash: block.block_header.raw_data.parentHash,
              blockNumber: block.block_header.raw_data.number,
              timestamp: convertUnixTimestamp(
                block.block_header.raw_data.timestamp
              ),
              witnessAddress: tronWeb.address.fromHex(
                block.block_header.raw_data.witness_address
              ),
              version: block.block_header.raw_data.version,
              witnessSignature: block.block_header.witness_signature,
            };

            jsonDataArray.push(blockData);

            const blockInsertSql = `
                            INSERT INTO blocks VALUES (?, ?, ?, ?, ?, ?, ?)
                        `;

            db.run(blockInsertSql, [
              blockData.blockHash,
              blockData.parentHash,
              blockData.blockNumber,
              blockData.timestamp + " UTC",
              tronWeb.address.fromHex(blockData.witnessAddress),
              blockData.version,
              blockData.witnessSignature,
            ]);

            for (const txs of block.transactions) {
              const transactionData = {
                txID: txs.txID,
                blockHash: blockData.blockHash,
                blockNumber: blockData.blockNumber,
                fromAddress:
                  txs.raw_data.contract[0].parameter.value.owner_address,
                gasPrice: txs.raw_data.contract[0].parameter.value.call_value,
                result: txs.ret[0].contractRet,
                input: txs.raw_data.contract[0].parameter.value.data,
                stakedAssetReleasedBalance:
                  txs.raw_data.contract[0].parameter.value.balance,
                resource: txs.raw_data.contract[0].parameter.value.resource,
                timestamp: convertUnixTimestamp(txs.raw_data.timestamp),
                expiration: convertUnixTimestamp(txs.raw_data.expiration),
                toAddress: txs.raw_data.contract[0].parameter.value.to_address,
                amount: txs.raw_data.contract[0].parameter.value.amount,
                feeLimit: txs.raw_data.fee_limit,
                type: txs.raw_data.contract[0].type,
                ownerAddress:
                  txs.raw_data.contract[0].parameter.value.owner_address,
                contractAddress:
                  txs.raw_data.contract[0].parameter.value.contract_address,
                resourcesTakenFromAddress:
                  txs.raw_data.contract[0].parameter.value.receiver_address,
                contractData: txs.raw_data.contract[0].parameter.value.data,
              };

              jsonDataArray.push(transactionData);

              const txInsertSql = `
                                INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `;

              db.run(txInsertSql, [
                transactionData.txID,
                transactionData.blockHash,
                transactionData.blockNumber,
                tronWeb.address.fromHex(transactionData.fromAddress),
                transactionData.gasPrice / 10 ** 6 + " TRX",
                transactionData.result,
                transactionData.input,
                transactionData.stakedAssetReleasedBalance / 10 ** 6 + " TRX",
                transactionData.resource,
                transactionData.timestamp + " UTC",
                transactionData.expiration + " UTC",
                tronWeb.address.fromHex(transactionData.toAddress),
                transactionData.amount / 10 ** 6 + " TRX",
                transactionData.feeLimit / 10 ** 6 + " TRX",
                transactionData.type,
                tronWeb.address.fromHex(transactionData.ownerAddress),
                tronWeb.address.fromHex(transactionData.contractAddress),
                tronWeb.address.fromHex(
                  transactionData.resourcesTakenFromAddress
                ),
                transactionData.contractData,
              ]);

              // console.log(`Transaction ${transactionData.txID} processed`);
            }

            console.log(`Block ${blockData.blockNumber} processed`);
          } catch (error) {}
        }

        try {
          const block = await tronWeb.trx.getBlock(blockNum);
          await processBlock(block);

          if (blockNum > latestBlockNumber) {
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for 2 seconds before checking again
            continue;
          }
        } catch (e) {
          console.error(`Error processing block ${blockNum}:`, e);
        }

        if (blockNum > latestBlockNumber) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for 2 seconds before checking again
          continue;
        }

        const jsonData = JSON.stringify(jsonDataArray, null, 2); // The last argument adds formatting for readability
        fs.writeFileSync("fetchedData.json", jsonData);
      } catch (e) {
        console.error(`Error processing block ${blockNum}:`, e);
      }

      blockNum++;
    }
  } catch (e) {
    console.error("Error:", e);
  } finally {
    db.close();
  }
}

async function main() {
  await listenToBlocks();
}

async function initialize() {
  try {
    await createTables();
    await main();
  } catch (error) {
    console.error("Initialization error:", error);
  }
}
