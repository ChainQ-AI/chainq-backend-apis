const ethers = require('ethers');
const sqlite3 = require('sqlite3');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

console.log(process.env.SCROLL_RPC_URL);
const provider = new ethers.providers.JsonRpcProvider(process.env.SCROLL_RPC_URL);

const db = new sqlite3.Database('scrollData.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, async (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Database opened');
        await initialize();
    }
});

async function createTables() {
    return new Promise((resolve, reject) => {
        db.run(`
CREATE TABLE IF NOT EXISTS blocks (
  blockHash TEXT,
  parentHash TEXT,
  blockNumber INTEGER,
  timestamp TEXT,
  nonce TEXT,
  difficulty TEXT,
  gasLimit TEXT,
  gasUsed TEXT,
  miner TEXT,
  extraData TEXT
)
`, (err) => {
            if (err) {
                reject(err);
            } else {
                console.log('Blocks table created');
                db.run(`
CREATE TABLE IF NOT EXISTS transactions (
    txHash TEXT PRIMARY KEY,
    type INTEGER,
    accessList TEXT,
    blockHash TEXT,
    blockNumber INTEGER,
    timestamp TEXT,
    transactionIndex INTEGER,
    confirmations INTEGER,
    fromAddress TEXT,
    gasPrice TEXT,
    gasLimit TEXT,
    toAddress TEXT,
    value TEXT,
    nonce INTEGER,
    data TEXT,
    creates TEXT,
    chainId INTEGER
)
`, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('Transactions table created');
                        resolve();
                    }
                });
            }
        });
    });
}

async function getLastIndex() {
    try {
        const result = await new Promise((resolve, reject) => {
            db.get('SELECT MAX(blockNumber) AS maxBlockHeight FROM blocks', (err, result) => {
                if (err) {
                    console.error('Error getting last index:', err);
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
        const latestBlockHeight = result.maxBlockHeight !== null ? result.maxBlockHeight : 0;
        console.log('Latest block height:', latestBlockHeight);
        if (latestBlockHeight === 0) {
            return latestBlockHeight;
        } else {
            return latestBlockHeight + 1;
        }
    } catch (e) {
        console.error('Error getting last index:', e);
        return null;
    }
}

function convertUnixTimestamp(unixTimestamp) {
    let timestamp = unixTimestamp;
    let date = new Date(timestamp * 1000);
    let formattedDate = date.toUTCString().replace("GMT", "UTC");
    // console.log(formattedDate);
    return formattedDate;
}

function hexToWeiToEther(_hexValue) {
    const wei = parseInt(_hexValue, 16);
    const etherValue = wei / Math.pow(10, 18);
    return etherValue;
}

function hexToGasPrice(gasInHex) {
    let gasPriceWei = ethers.BigNumber.from(gasInHex).toString();
    let gasPriceEther = (parseFloat(gasPriceWei) / Math.pow(10, 18)).toFixed(12);
    // console.log(gasPriceEther);
    return gasPriceEther
}

const jsonDataArray = [];

async function processBlock(block) {
    try {
        const blockData = {
            blockHash: block.hash,
            parentHash: block.parentHash,
            blockNumber: block.number,
            timestamp: convertUnixTimestamp(block.timestamp),
            nonce: block.nonce,
            difficulty: block.difficulty,
            gasLimit: parseInt(block.gasLimit._hex),
            gasUsed: parseInt(block.gasUsed._hex),
            miner: block.miner,
            extraData: block.extraData,

        };

        jsonDataArray.push(blockData);

        const blockInsertSql = `
INSERT INTO blocks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

        db.run(blockInsertSql, [
            blockData.blockHash,
            blockData.parentHash,
            blockData.blockNumber,
            blockData.timestamp,
            blockData.nonce,
            blockData.difficulty,
            blockData.gasLimit,
            blockData.gasUsed,
            blockData.miner,
            blockData.extraData,
        ]);

        for (const tx of block.transactions) {
            const transactionData = {
                hash: tx.hash,
                type: tx.type,
                accessList: tx.accessList,
                blockHash: tx.blockHash,
                blockNumber: tx.blockNumber,
                timestamp: blockData.timestamp,
                transactionIndex: tx.transactionIndex,
                confirmations: tx.confirmations,
                fromAddress: tx.from,
                gasPrice: hexToGasPrice(tx.gasPrice._hex),
                gasLimit: parseInt(tx.gasLimit._hex),
                toAddress: tx.to,
                value: hexToWeiToEther(tx.value._hex),
                // value: ethers.BigNumber.from(tx.value._hex).toString() / Math.pow(10, 18),
                nonce: tx.nonce,
                data: tx.data,
                creates: tx.creates,
                chainId: tx.chainId,
            };

            let gasPriceWei = ethers.BigNumber.from(tx.gasPrice._hex).toString();
            let gasPriceEther = (parseFloat(gasPriceWei) / Math.pow(10, 18)).toFixed(12);
            // console.log(gasPriceEther);
            jsonDataArray.push(transactionData);

            const txInsertSql = `
        INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

            db.run(txInsertSql, [
                transactionData.hash,
                transactionData.type,
                transactionData.accessList,
                transactionData.blockHash,
                transactionData.blockNumber,
                transactionData.timestamp,
                transactionData.transactionIndex,
                transactionData.confirmations,
                transactionData.fromAddress,
                transactionData.gasPrice,
                transactionData.gasLimit,
                transactionData.toAddress,
                transactionData.value,
                transactionData.nonce,
                transactionData.data,
                transactionData.creates,
                transactionData.chainId,
            ]);
        }

        console.log(`Block ${blockData.blockNumber} processed`);

    } catch (error) {
        console.error(error);
    }
}

async function listenToBlocks() {
    try {
        let blockNum = await getLastIndex();
        console.log(blockNum);

        if (blockNum !== 0 && (blockNum === null)) {
            blockNum = 0;
        }
        let latestBlockHeight = await provider.getBlockNumber();
        // console.log(latestBlockHeight)
        let latestBlockNumber = latestBlockHeight;
        // console.log(latestBlockNumber)

        while (true) {
            try {
                const block = await provider.getBlockWithTransactions(blockNum);
                // console.log(block)

                await processBlock(block);



                //***************************************//
                let scriptFetchedData = [];
                try {
                    const existingData = fs.readFileSync("fetchedData2.json", "utf8");
                    scriptFetchedData = JSON.parse(existingData);
                } catch (error) {
                    scriptFetchedData = [];
                }
                scriptFetchedData.push(block);
                fs.writeFileSync("fetchedData2.json", JSON.stringify(scriptFetchedData, null, 2));
                //***************************************//

                const jsonData = JSON.stringify(jsonDataArray, null, 2);
                fs.writeFileSync('fetchedData.json', jsonData);

                if (blockNum > latestBlockNumber) {
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds before checking again
                    continue;
                }
            } catch (e) {
                console.error(`Error processing block ${blockNum}:`, e);
            }

            blockNum++;
        }
    } catch (e) {
        console.error('Error:', e);
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
        console.error('Initialization error:', error);
    }
}
