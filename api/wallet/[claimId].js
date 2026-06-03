import { exec } from "child_process";
import path from "path";
import fs from "fs";

export default async function handler(req, res) {
  const { claimId } = req.query;

  if (!claimId) {
    return res.status(400).send("Missing claimId");
  }

  const passFile = path.join(
    process.cwd(),
    "wallet",
    `PAT-${claimId}.pkpass`
  );

  // Vercel read-only filesystem
// 不删除旧文件

console.log(
  "Generating wallet:",
  claimId
);

  exec(
    `cd wallet && node generate.cjs ${claimId}`,
    (error, stdout, stderr) => {
      if (error) {
        console.error("Wallet generation error:", error);
        console.error("STDERR:", stderr);
        return res
          .status(500)
          .send(stderr || error.message);
      }

      if (!fs.existsSync(passFile)) {
        console.error("Pass file not found:", passFile);
        console.log("STDOUT:", stdout);
        console.error("STDERR:", stderr);
        return res
          .status(404)
          .send("Pass file not found");
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
}