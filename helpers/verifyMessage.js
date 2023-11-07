const dotenv = require("dotenv");
const { verifyMessage } = require("viem");
dotenv.config();
const MSG_TO_SIGN = process.env.MSG_TO_SIGN;

const verifySign = async (address, signature) => {
  const valid = await verifyMessage({
    address: address,
    message: MSG_TO_SIGN,
    signature: signature,
  });
  console.log(valid);
  return valid;
};
module.exports = verifySign;
