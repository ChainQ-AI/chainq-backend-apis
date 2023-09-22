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
