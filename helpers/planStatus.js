const callContractFunction = require("./contractCallFunctions");
const isPlanActive = async (userAddress) => {
  try {
    const hasPlan = await callContractFunction("getSubscriptionStatus", [
      userAddress,
    ]);
    return hasPlan[0];
  } catch (error) {
    console.error("An error occurred:", error.message);
    return error.message;
  }
};
module.exports = isPlanActive;
