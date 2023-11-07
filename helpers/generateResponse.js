const OpenAI = require("openai");
const dotenv = require("dotenv");
dotenv.config();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const generateResponse = async (
  queryToTranslate,
  userAddress,
  dappAddress,
  chatHistory = []
) => {
  console.log("in generate response");
  console.log(`coming up: ${chatHistory}`);
  // Define the constant part of the user prompt and system prompt
  const systemPrompt =
    "you are a text-to-SQL translator. You write SQLite3 code based on plain-language prompts.";
  // const userPromptTemplate =
  //   " - Language SQLite3\n - There are 2 tables namely: blocks, transaction_data, \n - columns for block_data = [\n    blockHash TEXT,\n    parentHash TEXT,\n    blockNumber INTEGER PRIMARY KEY,\n    timeStamp INTEGER,\n    baseFeePerGas INTEGER,\n    difficulty TEXT,\n    logsBloom TEXT,\n    miner TEXT,\n    mixHash TEXT,\n    nonce TEXT,\n    receiptsRoot TEXT,\n    sha3Uncles TEXT,\n    size INTEGER,\n    stateRoot TEXT,\n    totalDifficulty TEXT,\n    transactionsRoot TEXT,\n    uncles TEXT,\n    gasLimit TEXT,\n    gasUsed INTEGER,\n    extraData TEXT],\n\n    - columns for transaction_data: [\n    blockHash TEXT,\n    blockNumber INTEGER,\n    fromAddress TEXT,\n    gas INTEGER,\n    gasPrice INTEGER,\n    hash TEXT,\n    input TEXT,\n    maxFeePerGas INTEGER,\n    maxPriorityFeePerGas INTEGER,\n    nonce INTEGER,\n    r TEXT,\n    s TEXT,\n    toAddress TEXT,\n    transactionIndex INTEGER,\n    type TEXT,\n    v INTEGER,\n    value TEXT\n    ]\n    - these are the only columns, never give output outside from this column\n    - Block_data table consists of data of a blockchain's block data\n    - transaction_data consists of transaction data\nYou are a SQL code translator. Your role is to translate natural language to SQLite3 query. Your only output should be SQL code. Do not include any other text. Only SQL code. And for every SQL query you generate the limit should be 10";

  const userPromptTemplate = `
      - Language: SQLite3
      - There are 2 tables: blocks and transactions
      - Columns for 'blocks' table:
        - blockHash TEXT PRIMARY KEY
        - parentHash TEXT
        - blockNumber INTEGER
        - timestamp TEXT
        - witnessAddress TEXT
        - version INTEGER
        - witnessSignature TEXT
    
      - Columns for 'transactions' table:
        - txID TEXT PRIMARY KEY
        - blockHash TEXT
        - blockNumber INTEGER
        - fromAddress TEXT
        - gasPrice INTEGER
        - result TEXT
        - input TEXT
        - stakedAssetReleasedBalance INTEGER
        - resource TEXT
        - timestamp TEXT
        - expiration TEXT
        - toAddress TEXT
        - amount REAL
        - feeLimit REAL
        - type TEXT
        - ownerAddress TEXT
        - contractAddress TEXT
        - resourcesTakenFromAddress TEXT
        - contractData TEXT
    
      - These are the only columns, never give output outside this column
      - 'blocks' table consists of data from Tron blockchain's block data
      - 'transactions' consists of transaction data
      - Please ensure that you consider the following guidelines when generating responses to prompts:
      
      
  
     
      
    
    You are a SQL code translator. Your role is to translate natural language to SQLite3 queries. Your only output should be SQL code. Do not include any other text. Only SQL code. 
    - Very important for every sql query the limit should be 10 only(everytime).
    - very important: Always make a SELECT query only (Read only queries) (never make write queries)
    `;

  const userPromptTemplateForDapp = `
      - Language: SQLite3
      - There are 2 tables: blocks and transactions
      - Columns for 'blocks' table:
        - blockHash TEXT PRIMARY KEY
        - parentHash TEXT
        - blockNumber INTEGER
        - timestamp TEXT
        - witnessAddress TEXT
        - version INTEGER
        - witnessSignature TEXT
    
      - Columns for 'transactions' table:
        - txID TEXT PRIMARY KEY
        - blockHash TEXT
        - blockNumber INTEGER
        - fromAddress TEXT
        - gasPrice INTEGER
        - result TEXT
        - input TEXT
        - stakedAssetReleasedBalance INTEGER
        - resource TEXT
        - timestamp TEXT
        - expiration TEXT
        - toAddress TEXT
        - amount REAL
        - feeLimit REAL
        - type TEXT
        - ownerAddress TEXT
        - contractAddress TEXT
        - resourcesTakenFromAddress TEXT
        - contractData TEXT
    
      - These are the only columns; never give output outside this column.
      - 'blocks' table consists of data from Tron blockchain's block data.
      - 'transactions' consists of transaction data.
      - Please ensure that you consider the following guidelines when generating responses to prompts:
  
      1. Whenever the prompt makes reference to a personal entity, which includes mentions of "me," "mine," "my," "my EOA" (Externally Owned Account), or "my Address," please replace these references with the designated variable ${userAddress} and if only and only if there is this personal reference like this, then focus on utilizing the fields from the transactions table that correspond to both ${userAddress} and ${dappAddress}. Check transactions involving both addresses as follows:
      - (fromAddress = ${userAddress} OR toAddress = ${userAddress} OR ownerAddress = ${userAddress}) 
        AND 
        (fromAddress = ${dappAddress} OR toAddress = ${dappAddress} OR ownerAddress = ${dappAddress})
  
      2. The purpose of using ${userAddress} and ${dappAddress} is to create a SQL query. Specifically, use these variables as the central points of reference when constructing SQL queries.
      
      3. The query should refer to both ${userAddress} and ${dappAddress} simultaneously, ensuring that transactions involving either of these addresses are considered.
  
    You are a SQL code translator. Your role is to translate natural language to SQLite3 queries. Your only output should be SQL code. Do not include any other text. Only SQL code. And for every SQL query you generate, the limit should be 10.
  `;

  try {
    let userPrompt;
    if (dappAddress) {
      userPrompt = `${userPromptTemplateForDapp}\nTranslate "${queryToTranslate}" to a syntactically-correct SQLite3 query.`;
    } else {
      userPrompt = `${userPromptTemplate}\nTranslate "${queryToTranslate}" to a syntactically-correct SQLite3 query.`;
    }

    // Get the last user message from chatHistory
    const lastUserMessage =
      chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : "";

    // Define the conversation with the system prompt, user prompt, and last user message
    const conversation = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
      { role: "user", content: lastUserMessage },
    ];
    // Call OpenAI to get the translation
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: conversation,
    });

    // Extract the translated SQL code from the response
    const sqlCode = completion.choices[0].message.content;

    return sqlCode;
  } catch (error) {
    console.error(error);
    console.log(`chatHistory ${chatHistory}`);
    console.log(`chatHistory len ${chatHistory.length}`);
    // Retry with modified chatHistory if an error occurs
    if (chatHistory.length >= 0) {
      // Remove the last response text but keep the prompt text

      console.log(chatHistory.promptText);
      return generateResponse(
        queryToTranslate,
        userAddress,
        dappAddress,
        chatHistory.promptText
      );
    } else {
      // No more chat history to remove, return an error message
      return "An error occurred with the OpenAI API.";
    }
  }
};

module.exports = generateResponse;
