const express = require("express");
const sqlite3 = require("sqlite3").verbose();

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
app.post("/addUser", (req, res) => {
  const { userAddress } = req.body;

  // Regular expression to match Ethereum EOA address format
  const eoaAddressRegex = /^(0x)?[0-9a-fA-F]{40}$/;

  if (!eoaAddressRegex.test(userAddress)) {
    res.status(400).json({ message: "Invalid Ethereum EOA address" });
    return;
  }

  db.run(
    "INSERT OR IGNORE INTO users (userAddress) VALUES (?)",
    [userAddress],
    (err) => {
      if (err) {
        res.status(500).json({ message: "Error adding user" });
      } else {
        res.status(201).json({ message: "User added successfully" });
      }
    }
  );
});

app.post("/chat", (req, res) => {
  const { userAddress, chatId, promptText, responseText } = req.body;

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

// Check if user exists (get user by userAddress)
app.get("/isUserExists/:userAddress", (req, res) => {
  const { userAddress } = req.params;

  db.get(
    "SELECT userAddress FROM users WHERE userAddress = ?",
    [userAddress],
    (err, row) => {
      if (err) {
        res.status(500).json({ message: "Error checking user" });
      } else {
        if (row) {
          res.status(200).json({ message: "User exists" });
        } else {
          res.status(404).json({ message: "User does not exist" });
        }
      }
    }
  );
});

// returns chat Id, chatTitle of a userAddress passed
app.get("/getUserChats/:userAddress", (req, res) => {
  const { userAddress } = req.params;

  db.all(
    "SELECT chatId, chatTitle FROM chats WHERE userAddress = ?",
    [userAddress],
    (err, rows) => {
      if (err) {
        res.status(500).json({ message: "Error retrieving user chats" });
      } else {
        if (rows.length > 0) {
          const chats = rows.map((row) => ({
            chatId: row.chatId,
            chatTitle: row.chatTitle,
          }));
          res.status(200).json({ chats });
        } else {
          res.status(404).json({ message: "User not found" });
        }
      }
    }
  );
});

app.get("/getPrompts/:userAddress/:chatId", (req, res) => {
  const { userAddress, chatId } = req.params;

  db.all(
    "SELECT promptId, promptText, responseText FROM prompts WHERE userAddress = ? AND chatId = ?",
    [userAddress, chatId],
    (err, rows) => {
      if (err) {
        res.status(500).json({ message: "Error retrieving prompts" });
      } else {
        if (rows.length > 0) {
          const prompts = rows.map((row) => ({
            promptId: row.promptId,
            promptText: row.promptText,
            responseText: row.responseText,
          }));
          res.status(200).json({ prompts });
        } else {
          res.status(404).json({ message: "No prompts found" });
        }
      }
    }
  );
});

app.get("/getPrompt/:userAddress/:chatId/:promptId", (req, res) => {
  const { userAddress, chatId, promptId } = req.params;

  db.get(
    "SELECT * FROM prompts WHERE userAddress = ? AND chatId = ? AND promptId = ?",
    [userAddress, chatId, promptId],
    (err, row) => {
      if (err) {
        res.status(500).json({ message: "Error retrieving prompt" });
      } else {
        if (row) {
          res.status(200).json(row);
        } else {
          res.status(404).json({ message: "Prompt not found" });
        }
      }
    }
  );
});

app.get("/getUserChatsAndPrompts/:userAddress", (req, res) => {
  const { userAddress } = req.params;

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

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
