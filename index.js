const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const dotenv = require("dotenv");
const TronWeb = require("tronweb");
const cors = require("cors");
const OpenAI = require("openai");
const bodyParser = require("body-parser");
dotenv.config();

// Importing JWT Packages
const expressJwt = require("express-jwt");
const jwt = require("jsonwebtoken");

// Secret key for JWT
const JWT_SECRET_KEY = process.env.JWT_ENV;
const MSG_TO_SIGN = process.env.MSG_TO_SIGN;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// creating Database
const db = new sqlite3.Database("chat_database.db", (err) => {
  if (err) {
    console.error("Error connecting to the database:", err.message);
  } else {
    console.log("Connected to the database");
  }
});

// const sqlite3TronData = require("sqlite3").verbose();
const tronDataDB = new sqlite3.Database("tronData.db");

// Authorization middleware to protect routes
app.use(
  expressJwt({
    secret: JWT_SECRET_KEY,
    algorithms: ["HS256"],
  }).unless({ path: ["/login", "/"] })
);

// Error handling middleware for invalid tokens
app.use((err, req, res, next) => {
  if (err.name === "UnauthorizedError") {
    res.status(401).json({ message: "Invalid token" });
  } else {
    next(err); // For other errors, pass them along
  }
});

// Custom error handling middleware
app.use((err, req, res, next) => {
  // Handle database-related errors
  if (err instanceof sqlite3.DatabaseError) {
    res.status(500).json({ message: "Database error" });
  } else {
    // Handle other types of errors
    res.status(500).json({ message: "Internal server error" });
  }
});

// ------------------------------------------------------------------------- Creating Table
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      userAddress TEXT PRIMARY KEY
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chats (
      userAddress TEXT,
      chatId TEXT PRIMARY KEY,
      chatTitle TEXT,
      timestamp TEXT,
      FOREIGN KEY (userAddress) REFERENCES users (userAddress)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS prompts (
      userAddress TEXT,
      chatId TEXT,
      promptId TEXT PRIMARY KEY,
      promptText TEXT,
      responseText TEXT,
      timestamp TEXT,
      FOREIGN KEY (userAddress, chatId) REFERENCES chats (userAddress, chatId)
    )
  `);

  console.log("Tables created or already exist");
});

// Default routes
app.get("/", (req, res) => {
  res.send("Welcome to ChainQ!");
});

// ---------------------------------------------------------------------- Insert Queries

// Add user (add user to user table) or login user
app.post("/login", (req, res) => {
  const { userAddress, signature } = req.body;

  const predefinedMessage = "hello";
  const address = TronWeb.Trx.verifyMessageV2(MSG_TO_SIGN, signature);

  // Check if the user already exists in the users table
  db.get(
    "SELECT userAddress FROM users WHERE userAddress = ?",
    [userAddress],
    (err, userRow) => {
      if (err) {
        res.status(500).json({ message: "Error checking user existence" });
      } else if (userRow) {
        // User already exists, create a JWT token for the user
        const payload = {
          userAddress, // You can include any user-related information here
        };
        const token = jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: "1d" });
        res.json({ token });
      } else if (address === userAddress) {
        // Signature is valid, create a JWT token for the user
        const payload = {
          userAddress, // You can include any user-related information here
        };
        const token = jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: "1d" });

        // Insert the user into the users table
        db.run(
          "INSERT INTO users (userAddress) VALUES (?)",
          [userAddress],
          (err) => {
            if (err) {
              res.status(500).json({ message: "Error adding user" });
            } else {
              res.json({ token });
            }
          }
        );
      } else {
        // Invalid signature
        res.status(401).json({ message: "Invalid signature" });
      }
    }
  );
});

function isSelectQuery(query) {
  // Simple check to see if the query starts with "SELECT" (case-insensitive)
  return /^SELECT/i.test(query.trim());
}

const executeQuery = async (query) => {
  return new Promise((resolve, reject) => {
    tronDataDB.all(query, (err, queryResult) => {
      if (err) {
        reject(err); // Reject the promise if there's an error
      } else {
        resolve(queryResult); // Resolve the promise with the query result
      }
    });
  });
};

// async function gett() {
//   console.log(
//     await executeQuery(
//       "SELECT blockHash\nFROM blocks\nORDER BY blockNumber DESC\nLIMIT 10;"
//     )
//   );
// }
// gett();

// Function to check if a query is a SELECT query
function isSelectQuery(query) {
  // Simple check to see if the query starts with "SELECT" (case-insensitive)
  return /^SELECT/i.test(query.trim());
}

// Function to generate the response (It will talk to OPEN AI APIs)
const generateResponse = async (
  queryToTranslate,
  userAddress,
  dappAddress,
  chatHistory = []
) => {
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

    1. Whenever the prompt makes reference to a personal entity, which includes mentions of "me," "mine," "my," "my EOA" (Externally Owned Account), or "my Address," please replace these references with the designated variable ${userAddress} and if only and only if there is this personal reference like this, then focus on utilizing the fields from the transactions table that correspond to the addresses involved in the transaction. You should primarily work with the following fields: fromAddress, toAddress, and ownerAddress.
    
    2. The purpose of using ${userAddress} is to create a SQL query. Specifically, use this variable as the central point of reference when constructing SQL queries.
    
    
  
  You are a SQL code translator. Your role is to translate natural language to SQLite3 queries. Your only output should be SQL code. Do not include any other text. Only SQL code. And for every SQL query you generate, the limit should be 10.
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
      userPrompt = `${userPromptTemplateForDapp}\nTranslate "${queryToTranslate}" to a syntactically-correct SQLite3 query.\n${chatHistory.join(
        "\n"
      )}`;
    } else {
      userPrompt = `${userPromptTemplate}\nTranslate "${queryToTranslate}" to a syntactically-correct SQLite3 query.\n${chatHistory.join(
        "\n"
      )}`;
    }

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

    return sqlCode;
  } catch (error) {
    console.error(error);
    throw new Error("An error occurred with the OpenAI API.");
  }
};

// chat endpoint
app.post("/chat", async (req, res) => {
  const { userAddress, chatId, promptText } = req.body;
  const authenticatedUserAddress = req.user.userAddress;
  let executedQuery;

  if (userAddress !== authenticatedUserAddress) {
    res
      .status(401)
      .json({ message: "You are not authorized to perform this action" });
    return;
  }

  const timestamp = new Date().toISOString();

  const responseText = await generateResponse(promptText, userAddress);

  if (responseText && isSelectQuery(responseText)) {
    executedQuery = await executeQuery(responseText);
  } else {
    return res.status(400).json({ message: "Invalid or non-SELECT query" });
  }

  if (chatId) {
    // Retrieve previous prompts and responses for the given chatId
    db.all(
      "SELECT promptText, responseText FROM prompts WHERE userAddress = ? AND chatId = ?",
      [userAddress, chatId],
      async (err, chatHistoryRows) => {
        if (err) {
          res.status(500).json({ message: "Error retrieving chat history" });
          return;
        }

        const chatHistory = chatHistoryRows.map(
          (chatHistoryRow) =>
            `${chatHistoryRow.promptText}\n${chatHistoryRow.responseText}`
        );

        // Generate the response using the chat history
        const responseText = await generateResponse(
          promptText,
          userAddress,
          chatHistory
        );

        if (responseText && isSelectQuery(responseText)) {
          executedQuery = await executeQuery(responseText);
        } else {
          return res
            .status(400)
            .json({ message: "Invalid or non-SELECT query" });
        }

        // Insert the new prompt into the database
        db.get(
          "SELECT chatTitle FROM chats WHERE userAddress = ? AND chatId = ?",
          [userAddress, chatId],
          (err, row) => {
            if (err) {
              res.status(500).json({ message: "Error checking chat" });
            } else {
              if (row) {
                const chatTitle = row.chatTitle;
                db.get(
                  "SELECT MAX(CAST(SUBSTR(promptId, -1) AS INTEGER)) AS lastPromptNumber FROM prompts WHERE userAddress = ? AND chatId = ?",
                  [userAddress, chatId],
                  (err, row) => {
                    if (err) {
                      res
                        .status(500)
                        .json({ message: "Error generating prompt number" });
                    } else {
                      const lastPromptNumber = row
                        ? parseInt(row.lastPromptNumber)
                        : 0;
                      const newPromptNumber = lastPromptNumber + 1;
                      const newPromptId = `${userAddress}-${
                        chatId.split("-")[1]
                      }-${newPromptNumber}`;

                      // Insert executedQuery into responseText field
                      db.run(
                        "INSERT OR IGNORE INTO prompts (userAddress, chatId, promptId, promptText, responseText, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                        [
                          userAddress,
                          chatId,
                          newPromptId,
                          promptText,
                          JSON.stringify(executedQuery),
                          timestamp,
                        ],
                        (err) => {
                          if (err) {
                            res
                              .status(500)
                              .json({ message: "Error adding prompt" });
                          } else {
                            res.status(201).json({
                              message: "Prompt added successfully",
                              chatId,
                              chatTitle,
                              promptId: newPromptId,
                              responseText,
                              executedQuery,
                              timestamp,
                            });
                          }
                        }
                      );
                    }
                  }
                );
              } else {
                res.status(404).json({ message: "Chat not found" });
              }
            }
          }
        );
      }
    );
  } else {
    db.get(
      "SELECT chatId FROM chats WHERE userAddress = ? ORDER BY chatId DESC LIMIT 1",
      [userAddress],
      (err, row) => {
        if (err) {
          res.status(500).json({ message: "Error generating chat ID" });
        } else {
          let lastChatIdNumericPart = 0;

          if (row) {
            const lastChatId = row.chatId;
            const numericPartMatch = lastChatId.match(/\d+$/);

            if (numericPartMatch) {
              lastChatIdNumericPart = parseInt(numericPartMatch[0]);
            }
          }

          const newChatNumber = lastChatIdNumericPart + 1;
          const newChatId = `${userAddress}-${newChatNumber}`;
          const chatTitle = promptText.substring(0, 20);

          const newPromptId = `${userAddress}-${newChatNumber}-1`;

          // Insert executedQuery into responseText field
          db.run(
            "INSERT OR IGNORE INTO chats (userAddress, chatId, chatTitle, timestamp) VALUES (?, ?, ?, ?)",
            [userAddress, newChatId, chatTitle, timestamp],
            (err) => {
              if (err) {
                res.status(500).json({ message: "Error adding chat" });
              } else {
                db.run(
                  "INSERT OR IGNORE INTO prompts (userAddress, chatId, promptId, promptText, responseText, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                  [
                    userAddress,
                    newChatId,
                    newPromptId,
                    promptText,
                    JSON.stringify(executedQuery),
                    timestamp,
                  ],
                  (err) => {
                    if (err) {
                      res.status(500).json({ message: "Error adding prompt" });
                    } else {
                      res.status(201).json({
                        message: "Chat and prompt added successfully",
                        chatId: newChatId,
                        chatTitle,
                        promptId: newPromptId,
                        responseText,
                        executedQuery,
                        timestamp,
                      });
                    }
                  }
                );
              }
            }
          );
        }
      }
    );
  }
});

app.post("/dappChat", async (req, res) => {
  const { userAddress, dappAddress, promptText, chatHistory } = req.body;
  const authenticatedUserAddress = req.user.userAddress;
  let executedQuery;
  let responseText;

  if (userAddress !== authenticatedUserAddress) {
    res
      .status(401)
      .json({ message: "You are not authorized to perform this action" });
    return;
  }

  try {
    const timestamp = new Date().toISOString();

    if (chatHistory) {
      responseText = await generateResponse(
        promptText,
        dappAddress,
        chatHistory
      );
    } else {
      responseText = await generateResponse(
        promptText,
        userAddress,
        dappAddress
      );
    }

    if (responseText && isSelectQuery(responseText)) {
      executedQuery = await executeQuery(responseText);

      res.status(200).json({
        message: "Response generated successfully",
        responseText,
        executedQuery,
        timestamp,
      });
    } else {
      res.status(400).json({ message: "Invalid or non-SELECT query" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred" });
  }
});

// Delete chat (and its prompts)
app.delete("/deleteChat/:chatId", (req, res) => {
  const { chatId } = req.params;
  const authenticatedUserAddress = req.user.userAddress; // Extract user information from the JWT token

  // Check if the chat belongs to the authenticated user
  db.get(
    "SELECT userAddress FROM chats WHERE chatId = ?",
    [chatId],
    (err, row) => {
      if (err) {
        res.status(500).json({ message: "Error checking chat ownership" });
      } else if (!row) {
        res.status(404).json({ message: "Chat not found" });
      } else if (row.userAddress !== authenticatedUserAddress) {
        res
          .status(401)
          .json({ message: "You are not authorized to delete this chat" });
      } else {
        // The authenticated user is authorized to delete the chat
        // Perform the deletion here...
        db.run("DELETE FROM prompts WHERE chatId = ?", [chatId], (err) => {
          if (err) {
            res.status(500).json({ message: "Error deleting prompts" });
          } else {
            db.run("DELETE FROM chats WHERE chatId = ?", [chatId], (err) => {
              if (err) {
                res.status(500).json({ message: "Error deleting chat" });
              } else {
                res
                  .status(200)
                  .json({ message: "Chat and prompts deleted successfully" });
              }
            });
          }
        });
      }
    }
  );
});

// Get user chats and prompts based on userAddress (protected route)
app.get("/getUserChatsAndPrompts/:userAddress", (req, res) => {
  const { userAddress } = req.params;
  const authenticatedUserAddress = req.user.userAddress; // Extract user information from the JWT token

  // Check if the requested userAddress matches the authenticated user's userAddress
  if (userAddress !== authenticatedUserAddress) {
    res
      .status(401)
      .json({ message: "You are not authorized to access this user's data" });
    return;
  }

  db.all(
    "SELECT chatId, chatTitle, timestamp FROM chats WHERE userAddress = ?",
    [userAddress],
    (err, chatRows) => {
      if (err) {
        res.status(500).json({ message: "Error retrieving user chats" });
      } else {
        if (chatRows.length > 0) {
          const userChats = [];
          let processedChats = 0;

          chatRows.forEach((chatRow) => {
            const chat = {
              chatId: chatRow.chatId,
              chatTitle: chatRow.chatTitle,
              timestamp: chatRow.timestamp,
              prompts: [],
            };

            db.all(
              "SELECT promptId, promptText, responseText, timestamp FROM prompts WHERE userAddress = ? AND chatId = ?",
              [userAddress, chatRow.chatId],
              (err, promptRows) => {
                if (err) {
                  res.status(500).json({ message: "Error retrieving prompts" });
                } else {
                  chat.prompts = promptRows.map((promptRow) => ({
                    promptId: promptRow.promptId,
                    promptText: promptRow.promptText,
                    responseText: promptRow.responseText,
                    timestamp: promptRow.timestamp,
                  }));

                  userChats.push(chat);
                  processedChats++;

                  if (processedChats === chatRows.length) {
                    res.status(200).json({ userChats });
                  }
                }
              }
            );
          });
        } else {
          res.status(404).json({ message: "User not found" });
        }
      }
    }
  );
});

// newly added endPoints 4 sept
// Get user's chat IDs along with chat titles based on userAddress (protected route)
app.get("/getUserChatIds/:userAddress", (req, res) => {
  const { userAddress } = req.params;
  const authenticatedUserAddress = req.user.userAddress; // Extract user information from the JWT token

  // Check if the requested userAddress matches the authenticated user's userAddress
  if (userAddress !== authenticatedUserAddress) {
    res
      .status(401)
      .json({ message: "You are not authorized to access this user's data" });
    return;
  }

  // Query the database to retrieve the user's chat IDs and chat titles
  db.all(
    "SELECT chatId, chatTitle, timestamp FROM chats WHERE userAddress = ?",
    [userAddress],
    (err, chatRows) => {
      if (err) {
        res.status(500).json({ message: "Error retrieving user's chat IDs" });
      } else {
        const chatData = chatRows.map((chatRow) => ({
          chatId: chatRow.chatId,
          chatTitle: chatRow.chatTitle,
          timestamp: chatRow.timestamp,
        }));

        if (chatData.length === 0) {
          res.status(404).json({ message: "No chat available" });
        } else {
          res.status(200).json({ chatData });
        }
      }
    }
  );
});

// Get all prompts and responses for a specific chat (protected route)
app.get("/getChatPromptsAndResponses/:chatId", (req, res) => {
  const { chatId } = req.params;
  const authenticatedUserAddress = req.user.userAddress; // Extract user information from the JWT token

  // Check if the chat belongs to the authenticated user
  db.get(
    "SELECT userAddress FROM chats WHERE chatId = ?",
    [chatId],
    (err, row) => {
      if (err) {
        res.status(500).json({ message: "Error checking chat ownership" });
      } else if (!row) {
        res.status(404).json({ message: "Chat not found" });
      } else if (row.userAddress !== authenticatedUserAddress) {
        res
          .status(401)
          .json({ message: "You are not authorized to access this chat" });
      } else {
        // The authenticated user is authorized to access the chat
        // Retrieve all prompts and responses for the chat
        db.all(
          "SELECT promptId, promptText, responseText, timestamp FROM prompts WHERE chatId = ?",
          [chatId],
          (err, promptRows) => {
            if (err) {
              res.status(500).json({ message: "Error retrieving prompts" });
            } else {
              const promptsAndResponses = promptRows.map((promptRow) => ({
                promptId: promptRow.promptId,
                promptText: promptRow.promptText,
                responseText: promptRow.responseText,
                timestamp: promptRow.timestamp,
              }));
              res.status(200).json({ promptsAndResponses });
            }
          }
        );
      }
    }
  );
});

// Get all prompts and responses for a specific chat (protected route)
app.get("/getChatData/:chatId", (req, res) => {
  const { chatId } = req.params;
  const authenticatedUserAddress = req.user.userAddress; // Extract user information from the JWT token

  // Check if the chat belongs to the authenticated user
  db.get(
    "SELECT userAddress FROM chats WHERE chatId = ?",
    [chatId],
    (err, row) => {
      if (err) {
        res.status(500).json({ message: "Error checking chat ownership" });
      } else if (!row) {
        res.status(404).json({ message: "Chat not found" });
      } else if (row.userAddress !== authenticatedUserAddress) {
        res
          .status(401)
          .json({ message: "You are not authorized to access this chat" });
      } else {
        // The authenticated user is authorized to access the chat
        // Retrieve all prompts and responses for the chat
        db.all(
          "SELECT promptText, responseText, timestamp FROM prompts WHERE chatId = ?",
          [chatId],
          (err, promptRows) => {
            if (err) {
              res.status(500).json({ message: "Error retrieving prompts" });
            } else {
              const promptsAndResponses = promptRows.map((promptRow) => ({
                promptText: promptRow.promptText,
                responseText: promptRow.responseText,
                timestamp: promptRow.timestamp,
              }));
              res.status(200).json({ promptsAndResponses });
            }
          }
        );
      }
    }
  );
});

// // Execute SQL SELECT query endpoint (no authentication required)
// app.post("/executeQuery", (req, res) => {
//   const { query } = req.body;

//   // Check if the query is a SELECT query
//   if (!isSelectQuery(query)) {
//     return res.status(400).json({ message: "Only SELECT queries are allowed" });
//   }

//   // Execute the SELECT query on the tronData.db database
//   tronDataDB.all(query, (err, result) => {
//     if (err) {
//       return res.status(500).json({ message: "Error executing query" });
//     }
//     res.status(200).json({ result });
//   });
// });

// dummy chat endpoint to save open AI creds (only for testing purpose)(same as /chat endpoint)
app.post("/dummyChat", async (req, res) => {
  const { userAddress, chatId, promptText } = req.body;
  const authenticatedUserAddress = req.user.userAddress;
  let executedQuery;

  if (userAddress !== authenticatedUserAddress) {
    res
      .status(401)
      .json({ message: "You are not authorized to perform this action" });
    return;
  }

  const timestamp = new Date().toISOString();

  const responseText =
    "SELECT * FROM 'blocks' ORDER BY blockNumber DESC LIMIT 3";

  if (responseText && isSelectQuery(responseText)) {
    executedQuery = await executeQuery(responseText);
  } else {
    return res.status(400).json({ message: "Invalid or non-SELECT query" });
  }

  if (chatId) {
    // Retrieve previous prompts and responses for the given chatId
    db.all(
      "SELECT promptText, responseText FROM prompts WHERE userAddress = ? AND chatId = ?",
      [userAddress, chatId],
      async (err, chatHistoryRows) => {
        if (err) {
          res.status(500).json({ message: "Error retrieving chat history" });
          return;
        }

        const chatHistory = chatHistoryRows.map(
          (chatHistoryRow) =>
            `${chatHistoryRow.promptText}\n${chatHistoryRow.responseText}`
        );

        // Generate the response using the chat history
        // const responseText = await generateResponse(promptText, userAddress, chatHistory);
        const responseText =
          "SELECT * FROM 'blocks' ORDER BY blockNumber DESC LIMIT 3";

        if (responseText && isSelectQuery(responseText)) {
          executedQuery = await executeQuery(responseText);
        } else {
          return res
            .status(400)
            .json({ message: "Invalid or non-SELECT query" });
        }

        // Insert the new prompt into the database
        db.get(
          "SELECT chatTitle FROM chats WHERE userAddress = ? AND chatId = ?",
          [userAddress, chatId],
          (err, row) => {
            if (err) {
              res.status(500).json({ message: "Error checking chat" });
            } else {
              if (row) {
                const chatTitle = row.chatTitle;
                db.get(
                  "SELECT MAX(CAST(SUBSTR(promptId, -1) AS INTEGER)) AS lastPromptNumber FROM prompts WHERE userAddress = ? AND chatId = ?",
                  [userAddress, chatId],
                  (err, row) => {
                    if (err) {
                      res
                        .status(500)
                        .json({ message: "Error generating prompt number" });
                    } else {
                      const lastPromptNumber = row
                        ? parseInt(row.lastPromptNumber)
                        : 0;
                      const newPromptNumber = lastPromptNumber + 1;
                      const newPromptId = `${userAddress}-${
                        chatId.split("-")[1]
                      }-${newPromptNumber}`;

                      // Insert executedQuery into responseText field
                      db.run(
                        "INSERT OR IGNORE INTO prompts (userAddress, chatId, promptId, promptText, responseText, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                        [
                          userAddress,
                          chatId,
                          newPromptId,
                          promptText,
                          JSON.stringify(executedQuery),
                          timestamp,
                        ],
                        (err) => {
                          if (err) {
                            res
                              .status(500)
                              .json({ message: "Error adding prompt" });
                          } else {
                            res.status(201).json({
                              message: "Prompt added successfully",
                              chatId,
                              chatTitle,
                              promptId: newPromptId,
                              responseText,
                              executedQuery,
                              timestamp,
                            });
                          }
                        }
                      );
                    }
                  }
                );
              } else {
                res.status(404).json({ message: "Chat not found" });
              }
            }
          }
        );
      }
    );
  } else {
    db.get(
      "SELECT chatId FROM chats WHERE userAddress = ? ORDER BY chatId DESC LIMIT 1",
      [userAddress],
      (err, row) => {
        if (err) {
          res.status(500).json({ message: "Error generating chat ID" });
        } else {
          let lastChatIdNumericPart = 0;

          if (row) {
            const lastChatId = row.chatId;
            const numericPartMatch = lastChatId.match(/\d+$/);

            if (numericPartMatch) {
              lastChatIdNumericPart = parseInt(numericPartMatch[0]);
            }
          }

          const newChatNumber = lastChatIdNumericPart + 1;
          const newChatId = `${userAddress}-${newChatNumber}`;
          const chatTitle = promptText.substring(0, 20);

          const newPromptId = `${userAddress}-${newChatNumber}-1`;

          // Insert executedQuery into responseText field
          db.run(
            "INSERT OR IGNORE INTO chats (userAddress, chatId, chatTitle, timestamp) VALUES (?, ?, ?, ?)",
            [userAddress, newChatId, chatTitle, timestamp],
            (err) => {
              if (err) {
                res.status(500).json({ message: "Error adding chat" });
              } else {
                db.run(
                  "INSERT OR IGNORE INTO prompts (userAddress, chatId, promptId, promptText, responseText, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                  [
                    userAddress,
                    newChatId,
                    newPromptId,
                    promptText,
                    JSON.stringify(executedQuery),
                    timestamp,
                  ],
                  (err) => {
                    if (err) {
                      res.status(500).json({ message: "Error adding prompt" });
                    } else {
                      res.status(201).json({
                        message: "Chat and prompt added successfully",
                        chatId: newChatId,
                        chatTitle,
                        promptId: newPromptId,
                        responseText,
                        executedQuery,
                        timestamp,
                      });
                    }
                  }
                );
              }
            }
          );
        }
      }
    );
  }
});

app.post("/dummyDappChat", async (req, res) => {
  const { userAddress, dappAddress, promptText, chatHistory } = req.body;
  const authenticatedUserAddress = req.user.userAddress;
  let executedQuery;
  let responseText;

  if (userAddress !== authenticatedUserAddress) {
    res
      .status(401)
      .json({ message: "You are not authorized to perform this action" });
    return;
  }

  try {
    const timestamp = new Date().toISOString();

    // if (chatHistory) {
    //   responseText = await generateResponse(
    //     promptText,
    //     userAddress,
    //     dappAddress,
    //     chatHistory
    //   );
    // } else {
    //   responseText = await generateResponse(
    //     promptText,
    //     userAddress,
    //     dappAddress
    //   );
    // }

    responseText =
      "SELECT *\nFROM transactions\nWHERE (fromAddress = 'TP7rcxBJp4FxJCgWKdK8Ay1rj6fTY8vRFi' OR toAddress = 'TP7rcxBJp4FxJCgWKdK8Ay1rj6fTY8vRFi' OR ownerAddress = 'TP7rcxBJp4FxJCgWKdK8Ay1rj6fTY8vRFi') \n      AND (fromAddress = '0xrcxBJp4FxJCgWKdK8Ay1rj6' OR toAddress = '0xrcxBJp4FxJCgWKdK8Ay1rj6' OR ownerAddress = '0xrcxBJp4FxJCgWKdK8Ay1rj6')\nORDER BY timestamp DESC\nLIMIT 5;";

    if (responseText && isSelectQuery(responseText)) {
      executedQuery = await executeQuery(responseText);

      res.status(200).json({
        message: "Response generated successfully",
        responseText,
        executedQuery,
        timestamp,
      });
    } else {
      res.status(400).json({ message: "Invalid or non-SELECT query" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred" });
  }
});

const port = 3002;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
