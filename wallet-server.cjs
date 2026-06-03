const express = require("express");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();

app.get("/wallet/:claimId", (req, res) => {
  const claimId = req.params.claimId;

  const passFile = path.join(
    __dirname,
    "wallet",
    `PAT-${claimId}.pkpass`
  );

  // 已存在则直接下载
  if (fs.existsSync(passFile)) {
  console.log(
    `Deleting old wallet: PAT-${claimId}`
  );

  fs.unlinkSync(passFile);
}

  // 不存在才生成
  exec(
    `cd wallet && node generate.cjs ${claimId}`,
    (error, stdout, stderr) => {
      if (error) {
        console.error(error);
        return res
          .status(500)
          .send(stderr || error.message);
      }

      res.download(passFile);
    }
  );
});

app.listen(3001, () => {
  console.log(
    "Wallet server running on port 3001"
  );
});