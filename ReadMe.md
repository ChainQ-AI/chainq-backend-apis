# ChainQ API Documentation

ChainQ is a project that simplifies querying the Tron blockchain using Natural Language Processing (NLP) and AI-generated responses. With ChainQ, you can interact with the Tron blockchain in a user-friendly way.

## Base URL

- The base URL for all endpoints is `https://chainq.lampros.tech\`.

## Authentication

- Most endpoints require authentication through JWT (JSON Web Tokens). Include the JWT token in the request headers as follows:
  - Key: `Authorization`
  - Value: `Bearer YOUR_TOKEN`

## Endpoints

### 1. Login

- **Endpoint:** `/login`
- **Method:** POST
- **Description:** Authenticate a user and obtain a JWT token for access to protected endpoints.
- **Request Body:**
  - `email` (string, required): User's email address.
  - `password` (string, required): User's password.
- **Response:**
  - `token` (string): JWT token for authentication.

### 2. Chat

- **Endpoint:** `/chat`
- **Method:** POST
- **Description:** Create or continue a chat session with the AI for blockchain queries.
- **Request Body:**
  - `userAddress` (string, required): User's Tron wallet address.
  - `chatId` (string, optional): ID of the chat session to continue.
  - `promptText` (string, required): User's query in natural language.
- **Response:**
  - `message` (string): Informational message.
  - `chatId` (string): ID of the chat session.
  - `chatTitle` (string): Title of the chat session.
  - `promptId` (string): ID of the prompt.
  - `responseText` (string): AI-generated response.
  - `executedQuery` (object): Executed query details.
  - `timestamp` (string): Timestamp of the response.

### 3. Dapp Chat

- **Endpoint:** `/dappChat`
- **Method:** POST
- **Description:** Query a Dapp (Decentralized Application) using natural language and AI-generated responses.
- **Request Body:**
  - `userAddress` (string, required): User's Tron wallet address.
  - `dappAddress` (string, required): Address of the Dapp to query.
  - `promptText` (string, required): User's query in natural language.
  - `chatHistory` (array, optional): Chat history for context.
- **Response:**
  - `message` (string): Informational message.
  - `responseText` (string): AI-generated response.
  - `executedQuery` (object): Executed query details.
  - `timestamp` (string): Timestamp of the response.

### 4. Delete Chat

- **Endpoint:** `/deleteChat/:chatId`
- **Method:** DELETE
- **Description:** Delete a chat session and its prompts.
- **Request Parameters:**
  - `chatId` (string, required): ID of the chat session to delete.
- **Response:**
  - `message` (string): Informational message.

### 5. Delete User Data

- **Endpoint:** `/deleteUserData/:userAddress`
- **Method:** DELETE
- **Description:** Delete all chats and associated prompts for a user.
- **Request Parameters:**
  - `userAddress` (string, required): User's Tron wallet address.
- **Response:**
  - `message` (string): Informational message.

### 6. Get User Chats and Prompts

- **Endpoint:** `/getUserChatsAndPrompts/:userAddress`
- **Method:** GET
- **Description:** Retrieve a user's chat sessions and associated prompts.
- **Request Parameters:**
  - `userAddress` (string, required): User's Tron wallet address.
- **Response:**
  - `userChats` (array): Array of user's chat sessions.
    - `chatId` (string): ID of the chat session.
    - `chatTitle` (string): Title of the chat session.
    - `timestamp` (string): Timestamp of the chat session.
    - `prompts` (array): Array of prompts in the chat.
      - `promptId` (string): ID of the prompt.
      - `promptText` (string): User's query in natural language.
      - `responseText` (string): AI-generated response.
      - `timestamp` (string): Timestamp of the prompt.

### 7. Get User Chat IDs

- **Endpoint:** `/getUserChatIds/:userAddress`
- **Method:** GET
- **Description:** Retrieve chat IDs and titles for a user.
- **Request Parameters:**
  - `userAddress` (string, required): User's Tron wallet address.
- **Response:**
  - `chatData` (array): Array of chat IDs and titles.
    - `chatId` (string): ID of the chat session.
    - `chatTitle` (string): Title of the chat session.
    - `timestamp` (string): Timestamp of the chat session.

### 8. Get Chat Prompts and Responses

- **Endpoint:** `/getChatPromptsAndResponses/:chatId`
- **Method:** GET
- **Description:** Retrieve all prompts and responses for a specific chat session.
- **Request Parameters:**
  - `chatId` (string, required): ID of the chat session.
- **Response:**
  - `promptsAndResponses` (array): Array of prompts and AI-generated responses.
    - `promptId` (string): ID of the prompt.
    - `promptText` (string): User's query in natural language.
    - `responseText` (string): AI-generated response.
    - `timestamp` (string): Timestamp of the prompt.

### 9. Get Chat Data

- **Endpoint:** `/getChatData/:chatId`
- **Method:** GET
- **Description:** Retrieve all prompts and AI-generated responses for a specific chat session.
- **Request Parameters:**
  - `chatId` (string, required): ID of the chat session.
- **Response:**
  - `promptsAndResponses` (array): Array of prompts and AI-generated responses.
    - `promptText` (string): User's query in natural language.
    - `responseText` (string): AI-generated response.
    - `timestamp` (string): Timestamp of the prompt.

## Note

- Replace `YOUR_TOKEN` with the actual JWT token obtained during login.
- Use the provided endpoints to interact with the Tron blockchain in a conversational manner using ChainQ.

For more information or assistance, contact the ChainQ team at [squirtle.snap@gmail.com].
