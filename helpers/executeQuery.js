const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("chat_database.db", (err) => {
  if (err) {
    console.error("Error connecting to the database:", err.message);
  } else {
    console.log("Connected to the database");
  }
});
const tronDataDB = new sqlite3.Database("tronData.db");
const executeQuery = async (query) => {
  console.log("in executeQuery");
  try {
    return await new Promise((resolve, reject) => {
      tronDataDB.all(query, (err, queryResult) => {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          resolve(queryResult);
        }
      });
    });
  } catch (error) {
    console.error("An error occurred:", error);
  }
};

module.exports = executeQuery;
