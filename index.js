const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const dotenv = require("dotenv");
const cors = require("cors");

const bodyParser = require("body-parser");

// helper functions
const verifySign = require("./helpers/verifyMessage");
const isPlanActive = require("./helpers/planStatus");
const isSelectQuery = require("./helpers/isSelectQuery");
const executeQuery = require("./helpers/executeQuery");
const generateResponse = require("./helpers/generateResponse");

dotenv.config();

// Secret key for JWT
const JWT_SECRET_KEY = process.env.JWT_ENV;

// Importing JWT Packages
const expressJwt = require("express-jwt");
const jwt = require("jsonwebtoken");

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
app.post("/login", async (req, res) => {
  const { userAddress, signature } = req.body;

  // const hasPlan = await isPlanActive(userAddress);
  // console.log(`is it ${hasPlan}`);

  try {
    const isValid = verifySign(userAddress, signature);
    // console.log(hasPlan);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid Signature" });
    }
  } catch (err) {
    console.log(err);
    return res
      .status(401)
      .json({ message: "INVALID_ARGUMENT: Invalid Signature size(bytes)" });
  }

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
      } else {
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
      }
    }
  );
});

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
  const planStatus = await isPlanActive(userAddress);
  if (!planStatus) {
    return res.status(400).json({ message: "No active Plans, Buy plan first" });
  }

  const timestamp = new Date().toISOString();

  const responseText = await generateResponse(promptText, userAddress);

  if (responseText.startsWith("An error occurred")) {
    return res.status(400).json({ message: "OPEN AI Limit Exceeded" });
  }
  if (responseText && isSelectQuery(responseText)) {
    try {
      executedQuery = await executeQuery(responseText);
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
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

        const chatHistory = chatHistoryRows.map((chatHistoryRow) => ({
          promptText: chatHistoryRow.promptText,
          responseText: chatHistoryRow.responseText,
        }));

        console.log(chatHistory);

        // Generate the response using the chat history
        const responseText = await generateResponse(
          promptText,
          userAddress,
          chatHistory
        );

        if (responseText && isSelectQuery(responseText)) {
          try {
            executedQuery = await executeQuery(responseText);
          } catch (err) {
            console.error(err);
            res.status(500).send("Internal Server Error");
          }
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
      "SELECT MAX(CAST(SUBSTR(chatId, INSTR(chatId, '-') + 1) AS INTEGER)) AS lastChatNumber FROM chats WHERE userAddress = ?",
      [userAddress],
      (err, row) => {
        if (err) {
          res.status(500).json({ message: "Error generating chat ID" });
        } else {
          let lastChatIdNumericPart = 0;

          if (row && row.lastChatNumber !== null) {
            lastChatIdNumericPart = row.lastChatNumber;
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
      try {
        executedQuery = await executeQuery(responseText);
      } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
      }

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

app.delete("/deleteUserData/:userAddress", (req, res) => {
  const { userAddress } = req.params;
  const authenticatedUserAddress = req.user.userAddress; // Extract user information from the JWT token

  // Check if the requested userAddress matches the authenticated user's userAddress
  if (userAddress !== authenticatedUserAddress) {
    res
      .status(401)
      .json({ message: "You are not authorized to delete this user's data" });
    return;
  }

  // Delete all chats and associated prompts for the specified userAddress
  db.run("DELETE FROM prompts WHERE userAddress = ?", [userAddress], (err) => {
    if (err) {
      res.status(500).json({ message: "Error deleting prompts" });
    } else {
      db.run(
        "DELETE FROM chats WHERE userAddress = ?",
        [userAddress],
        (err) => {
          if (err) {
            res.status(500).json({ message: "Error deleting chats" });
          } else {
            res.status(200).json({ message: "User data deleted successfully" });
          }
        }
      );
    }
  });
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

  const planStatus = await isPlanActive(userAddress);
  if (!planStatus) {
    return res.status(400).json({ message: "No active Plans, Buy plan first" });
  }

  const timestamp = new Date().toISOString();

  const responseText =
    "SELECT * FROM 'blocks' ORDER BY blockNumber DESC LIMIT 3";

  if (responseText && isSelectQuery(responseText)) {
    try {
      executedQuery = await executeQuery(responseText);
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
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
          try {
            executedQuery = await executeQuery(responseText);
          } catch (err) {
            console.error(err);
            res.status(500).send("Internal Server Error");
          }
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
    // console.log("in else");
    db.get(
      "SELECT MAX(CAST(SUBSTR(chatId, INSTR(chatId, '-') + 1) AS INTEGER)) AS lastChatNumber FROM chats WHERE userAddress = ?",
      [userAddress],
      (err, row) => {
        if (err) {
          res.status(500).json({ message: "Error generating chat ID" });
        } else {
          let lastChatIdNumericPart = 0;

          if (row && row.lastChatNumber !== null) {
            lastChatIdNumericPart = row.lastChatNumber;
          }
          // console.log(lastChatIdNumericPart);

          const newChatNumber = lastChatIdNumericPart + 1;
          // console.log(newChatNumber);
          const newChatId = `${userAddress}-${newChatNumber}`;
          // console.log("chatID:");
          // console.log(newChatNumber);
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

//deletes all user chatIDs (all user data)
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

  const planStatus = await isPlanActive(userAddress);
  if (!planStatus) {
    return res.status(400).json({ message: "No active Plans, Buy plan first" });
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
      try {
        executedQuery = await executeQuery(responseText);
      } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
      }

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
