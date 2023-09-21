const express = require("express");
const OpenAI = require("openai");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const port = 3000;

// Set your OpenAI API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Enable CORS
app.use(cors());

// Parse JSON request bodies
app.use(bodyParser.json());

// Define the constant part of the user prompt and system prompt
const systemPrompt =
  "you are a text-to-SQL translator. You write SQLite3 code based on plain-language prompts.";
const userPromptTemplate =
  " - Language SQLite3\n - There are 2 tables namely: block_data, transaction_data, \n - columns for block_data = [\n    blockHash TEXT,\n    parentHash TEXT,\n    blockHeight INTEGER PRIMARY KEY,\n    timeStamp INTEGER,\n    baseFeePerGas INTEGER,\n    difficulty TEXT,\n    logsBloom TEXT,\n    miner TEXT,\n    mixHash TEXT,\n    nonce TEXT,\n    receiptsRoot TEXT,\n    sha3Uncles TEXT,\n    size INTEGER,\n    stateRoot TEXT,\n    totalDifficulty TEXT,\n    transactionsRoot TEXT,\n    uncles TEXT,\n    gasLimit TEXT,\n    gasUsed INTEGER,\n    extraData TEXT],\n\n    - columns for transaction_data: [\n    blockHash TEXT,\n    blockNumber INTEGER,\n    fromAddress TEXT,\n    gas INTEGER,\n    gasPrice INTEGER,\n    hash TEXT,\n    input TEXT,\n    maxFeePerGas INTEGER,\n    maxPriorityFeePerGas INTEGER,\n    nonce INTEGER,\n    r TEXT,\n    s TEXT,\n    toAddress TEXT,\n    transactionIndex INTEGER,\n    type TEXT,\n    v INTEGER,\n    value TEXT\n    ]\n    - these are the only columns, never give output outside from this column\n    - Block_data table consists of data of a blockchain's block data\n    - transaction_data consists of transaction data\nYou are a SQL code translator. Your role is to translate natural language to SQLite3 query. Your only output should be SQL code. Do not include any other text. Only SQL code.";

app.get("/", (req, res) => {
  res.send("Welcome to the ChainQ apis!");
});

// API endpoint for translating text
app.post("/translate", async (req, res) => {
  try {
    // Get the specific query to translate from the request
    const queryToTranslate = req.body.query_to_translate;

    // Combine the user prompt template with the specific query
    const userPrompt = `${userPromptTemplate}\nTranslate "${queryToTranslate}" to a syntactically-correct SQLite3 query.`;

    // Define the conversation for OpenAI
    const conversation = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    // Call OpenAI to get the translation
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: conversation,
    });

    // Extract the translated SQL code from the response
    const sqlCode = completion.choices[0].message.content;

    res.json({ sql_code: sqlCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred with the OpenAI API." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
