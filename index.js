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
      FOREIGN KEY (userAddress, chatId) REFERENCES chats (userAddress, chatId)
    )
  `);

  console.log("Tables created or already exist");
});

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

const generateResponse = async (queryToTranslate) => {
  // Define the constant part of the user prompt and system prompt
  const systemPrompt =
    "you are a text-to-SQL translator. You write SQLite3 code based on plain-language prompts.";
  const userPromptTemplate =
    " - Language SQLite3\n - There are 2 tables namely: blocks, transaction_data, \n - columns for block_data = [\n    blockHash TEXT,\n    parentHash TEXT,\n    blockNumber INTEGER PRIMARY KEY,\n    timeStamp INTEGER,\n    baseFeePerGas INTEGER,\n    difficulty TEXT,\n    logsBloom TEXT,\n    miner TEXT,\n    mixHash TEXT,\n    nonce TEXT,\n    receiptsRoot TEXT,\n    sha3Uncles TEXT,\n    size INTEGER,\n    stateRoot TEXT,\n    totalDifficulty TEXT,\n    transactionsRoot TEXT,\n    uncles TEXT,\n    gasLimit TEXT,\n    gasUsed INTEGER,\n    extraData TEXT],\n\n    - columns for transaction_data: [\n    blockHash TEXT,\n    blockNumber INTEGER,\n    fromAddress TEXT,\n    gas INTEGER,\n    gasPrice INTEGER,\n    hash TEXT,\n    input TEXT,\n    maxFeePerGas INTEGER,\n    maxPriorityFeePerGas INTEGER,\n    nonce INTEGER,\n    r TEXT,\n    s TEXT,\n    toAddress TEXT,\n    transactionIndex INTEGER,\n    type TEXT,\n    v INTEGER,\n    value TEXT\n    ]\n    - these are the only columns, never give output outside from this column\n    - Block_data table consists of data of a blockchain's block data\n    - transaction_data consists of transaction data\nYou are a SQL code translator. Your role is to translate natural language to SQLite3 query. Your only output should be SQL code. Do not include any other text. Only SQL code.";
  try {
    // // Combine the user prompt template with the specific query
    // const userPrompt = `${userPromptTemplate}\nTranslate "${queryToTranslate}" to a syntactically-correct SQLite3 query.`;

    // // Define the conversation for OpenAI
    // const conversation = [
    //   { role: "system", content: systemPrompt },
    //   { role: "user", content: userPrompt },
    // ];

    // // Call OpenAI to get the translation
    // const completion = await openai.chat.completions.create({
    //   model: "gpt-3.5-turbo",
    //   messages: conversation,
    // });

    // // Extract the translated SQL code from the response
    // const sqlCode = completion.choices[0].message.content;

    // return sqlCode;
    return "SELECT * FROM blocks LIMIT 10;";
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

  const responseText = await generateResponse(promptText);

  if (responseText && isSelectQuery(responseText)) {
    executedQuery = await executeQuery(responseText);
  } else {
    return res.status(400).json({ message: "Invalid or non-SELECT query" });
  }

  if (chatId) {
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
                    "INSERT OR IGNORE INTO prompts (userAddress, chatId, promptId, promptText, responseText) VALUES (?, ?, ?, ?, ?)",
                    [
                      userAddress,
                      chatId,
                      newPromptId,
                      promptText,
                      JSON.stringify(executedQuery),
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
            "INSERT OR IGNORE INTO chats (userAddress, chatId, chatTitle) VALUES (?, ?, ?)",
            [userAddress, newChatId, chatTitle],
            (err) => {
              if (err) {
                res.status(500).json({ message: "Error adding chat" });
              } else {
                db.run(
                  "INSERT OR IGNORE INTO prompts (userAddress, chatId, promptId, promptText, responseText) VALUES (?, ?, ?, ?, ?)",
                  [
                    userAddress,
                    newChatId,
                    newPromptId,
                    promptText,
                    JSON.stringify(executedQuery),
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
    "SELECT chatId, chatTitle FROM chats WHERE userAddress = ?",
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
              prompts: [],
            };

            db.all(
              "SELECT promptId, promptText, responseText FROM prompts WHERE userAddress = ? AND chatId = ?",
              [userAddress, chatRow.chatId],
              (err, promptRows) => {
                if (err) {
                  res.status(500).json({ message: "Error retrieving prompts" });
                } else {
                  chat.prompts = promptRows.map((promptRow) => ({
                    promptId: promptRow.promptId,
                    promptText: promptRow.promptText,
                    responseText: promptRow.responseText,
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
    "SELECT chatId, chatTitle FROM chats WHERE userAddress = ?",
    [userAddress],
    (err, chatRows) => {
      if (err) {
        res.status(500).json({ message: "Error retrieving user's chat IDs" });
      } else {
        const chatData = chatRows.map((chatRow) => ({
          chatId: chatRow.chatId,
          chatTitle: chatRow.chatTitle,
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
          "SELECT promptId, promptText, responseText FROM prompts WHERE chatId = ?",
          [chatId],
          (err, promptRows) => {
            if (err) {
              res.status(500).json({ message: "Error retrieving prompts" });
            } else {
              const promptsAndResponses = promptRows.map((promptRow) => ({
                promptId: promptRow.promptId,
                promptText: promptRow.promptText,
                responseText: promptRow.responseText,
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
          "SELECT promptText, responseText FROM prompts WHERE chatId = ?",
          [chatId],
          (err, promptRows) => {
            if (err) {
              res.status(500).json({ message: "Error retrieving prompts" });
            } else {
              const promptsAndResponses = promptRows.map((promptRow) => ({
                promptText: promptRow.promptText,
                responseText: promptRow.responseText,
              }));
              res.status(200).json({ promptsAndResponses });
            }
          }
        );
      }
    }
  );
});

// Execute SQL SELECT query endpoint (no authentication required)
app.post("/executeQuery", (req, res) => {
  const { query } = req.body;

  // Check if the query is a SELECT query
  if (!isSelectQuery(query)) {
    return res.status(400).json({ message: "Only SELECT queries are allowed" });
  }

  // Execute the SELECT query on the tronData.db database
  tronDataDB.all(query, (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error executing query" });
    }
    res.status(200).json({ result });
  });
});

// Function to check if a query is a SELECT query
function isSelectQuery(query) {
  // Simple check to see if the query starts with "SELECT" (case-insensitive)
  return /^SELECT/i.test(query.trim());
}

// Define a function to execute an SQL query on the tronData.db database
// function executeQuery(query, callback) {
//   // Check if the query is a SELECT query
//   if (!isSelectQuery(query)) {
//     const error = new Error("Only SELECT queries are allowed");
//     error.status = 400;
//     return callback(error, null);
//   }

//   // Execute the SELECT query on the tronData.db database
//   tronDataDB.all(query, (err, result) => {
//     if (err) {
//       const error = new Error("Error executing query");
//       error.status = 500;
//       return callback(error, null);
//     }
//     callback(null, result);
//   });
// }

const port = 3001;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
