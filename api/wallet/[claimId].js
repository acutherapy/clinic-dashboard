const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

module.exports = async (req, res) => {
  const { claimId } = req.query;

  if (!claimId) {
    return res.status(400).send("Missing claimId");
  }

  const passFile = path.join(
    process.cwd(),
    "wallet",
    `PAT-${claimId}.pkpass`
  );

  if (fs.existsSync(passFile)) {
    fs.unlinkSync(passFile);
  }

  exec(
    `cd wallet && node generate.cjs ${claimId}`,
    (error, stdout, stderr) => {
      if (error) {
        console.error(error);
        return res.status(500).send(stderr || error.message);
      }

      if (!fs.existsSync(passFile)) {
        return res.status(404).send("Pass file not found");
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.apple.pkpass"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="PAT-${claimId}.pkpass"`
      );

      fs.createReadStream(passFile).pipe(res);
    }
  );
};