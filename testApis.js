const chai = require("chai");
const chaiHttp = require("chai-http");
const app = require("./index.js"); // Replace with the actual path to your Express app file
const expect = chai.expect;

chai.use(chaiHttp);

describe("Express APIs", () => {
  let authToken;

  // Before running tests, obtain the authentication token
  before((done) => {
    const userCredentials = {
      userAddress: "TP7rcxBJp4FxJCgWKdK8Ay1rj6fTY8vRFi",
      signature:
        "0xf5dfcac6e6dd02bab7308034495d061c10528ebdc64a0e474c65b97f069e85234eca55d7be45c05b6c047ca486df73b2ae41a5517168e6ebbed62d003e0da5541b", // Replace with a valid signature
    };

    chai
      .request(app)
      .post("/login")
      .send(userCredentials)
      .end((err, res) => {
        authToken = res.body.token;
        done();
      });
  });

  // Test the /login route
  describe("POST /login", () => {
    it("should return an authentication token on successful login", (done) => {
      const userCredentials = {
        userAddress: "TP7rcxBJp4FxJCgWKdK8Ay1rj6fTY8vRFi",
        signature:
          "0xf5dfcac6e6dd02bab7308034495d061c10528ebdc64a0e474c65b97f069e85234eca55d7be45c05b6c047ca486df73b2ae41a5517168e6ebbed62d003e0da5541b", // Replace with a valid signature
      };

      chai
        .request(app)
        .post("/login")
        .send(userCredentials)
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.have.property("token");
          done();
        });
    });

    it("should return an error on invalid login", (done) => {
      const invalidCredentials = {
        userAddress: "InvalidUserAddress",
        signature: "InvalidSignature",
      };

      chai
        .request(app)
        .post("/login")
        .send(invalidCredentials)
        .end((err, res) => {
          expect(res).to.have.status(401); // Expect a 401 Unauthorized status
          expect(res.body).to.have.property("message", "Invalid token");
          done();
        });
    });
  });

  // Test the /chat route for creating a new chat
  describe("POST /chat (New Chat)", () => {
    it("should create a new chat and return 201 status", (done) => {
      const newChat = {
        promptText: "Hello",
        responseText: "Hi",
      };

      chai
        .request(app)
        .post("/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send(newChat)
        .end((err, res) => {
          expect(res).to.have.status(201); // Expect a 201 Created status
          expect(res.body).to.have.property(
            "message",
            "Chat and prompt added successfully"
          );
          expect(res.body).to.have.property("chatId").that.is.not.empty;
          newChatId = res.body.chatId; // Store the new chat ID
          done();
        });
    });
  });

  // Test the /chat route for continuing an existing chat
  describe("POST /chat (Continue Chat)", () => {
    it("should continue an existing chat and return 201 status", (done) => {
      const continueChat = {
        chatId: newChatId, // Use the chat ID from the "new chat" test
        promptText: "How are you?",
        responseText: "I'm good!",
      };

      chai
        .request(app)
        .post("/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send(continueChat)
        .end((err, res) => {
          expect(res).to.have.status(201); // Expect a 201 Created status
          expect(res.body).to.have.property(
            "message",
            "Prompt added successfully"
          );
          expect(res.body).to.have.property("chatId", newChatId); // Ensure the same chat ID
          done();
        });
    });
  });

  // Add more test cases for your other routes here

  // Delete the chat created for testing (if needed) in an after hook
  after((done) => {
    // You can send a request to delete the chat here
    // Replace with actual code to delete the chat
    done();
  });
});
