const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const dotenv = require("dotenv");
const TronWeb = require("tronweb");
const cors = require("cors");
dotenv.config();

// Importing JWT Packages
const expressJwt = require("express-jwt");
const jwt = require("jsonwebtoken");

// Secret key for JWT
const JWT_SECRET_KEY = process.env.JWT_ENV;
const MSG_TO_SIGN = process.env.MSG_TO_SIGN;

const app = express();
app.use(express.json());

// creating Database
const db = new sqlite3.Database("chat_database.db", (err) => {
  if (err) {
    console.error("Error connecting to the database:", err.message);
  } else {
    console.log("Connected to the database");
  }
});

app.use(cors());

// Authorization middleware to protect routes
app.use(
  expressJwt({
    secret: JWT_SECRET_KEY,
    algorithms: ["HS256"],
  }).unless({ path: ["/login"] })
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

// ---------------------------------------------------------------------- Insert Queries

// Add user (add user to user table)
app.post("/login", (req, res) => {
  const { userAddress, signature } = req.body;

  const predefinedMessage = "hello";
  const address = TronWeb.Trx.verifyMessageV2(MSG_TO_SIGN, signature);
  if (address === userAddress) {
    // Signature is valid, create a JWT token for the user
    const payload = {
      userAddress, // You can include any user-related information here
    };
    const token = jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: "1d" });
    res.json({ token });
  } else {
    // Invalid signature
    res.status(401).json({ message: "Invalid signature" });
  }
});

app.post("/chat", (req, res) => {
  const { userAddress, chatId, promptText, responseText } = req.body;
  const authenticatedUserAddress = req.user.userAddress;

  if (userAddress !== authenticatedUserAddress) {
    res
      .status(401)
      .json({ message: "You are not authorized to perform this action" });
    return;
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

                  db.run(
                    "INSERT OR IGNORE INTO prompts (userAddress, chatId, promptId, promptText, responseText) VALUES (?, ?, ?, ?, ?)",
                    [
                      userAddress,
                      chatId,
                      newPromptId,
                      promptText,
                      responseText,
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
      "SELECT MAX(chatId) AS lastChatId FROM chats WHERE userAddress = ?",
      [userAddress],
      (err, row) => {
        if (err) {
          res.status(500).json({ message: "Error generating chat ID" });
        } else {
          const lastChatId = row ? row.lastChatId : null;
          const newChatNumber = lastChatId
            ? parseInt(lastChatId.split("-")[1]) + 1
            : 1;

          const newChatId = `${userAddress}-${newChatNumber}`;
          const chatTitle = promptText.substring(0, 20);

          db.run(
            "INSERT OR IGNORE INTO chats (userAddress, chatId, chatTitle) VALUES (?, ?, ?)",
            [userAddress, newChatId, chatTitle],
            (err) => {
              if (err) {
                res.status(500).json({ message: "Error adding chat" });
              } else {
                const newPromptId = `${userAddress}-${newChatNumber}-1`;

                db.run(
                  "INSERT OR IGNORE INTO prompts (userAddress, chatId, promptId, promptText, responseText) VALUES (?, ?, ?, ?, ?)",
                  [
                    userAddress,
                    newChatId,
                    newPromptId,
                    promptText,
                    responseText,
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
// Get user's chat IDs based on userAddress (protected route)
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

  // Query the database to retrieve the user's chat IDs
  db.all(
    "SELECT chatId FROM chats WHERE userAddress = ?",
    [userAddress],
    (err, chatRows) => {
      if (err) {
        res.status(500).json({ message: "Error retrieving user's chat IDs" });
      } else {
        const chatIds = chatRows.map((chatRow) => chatRow.chatId);
        res.status(200).json({ chatIds });
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

const port = 3001;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
