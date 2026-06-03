const fs = require("fs");
const { PKPass } = require("passkit-generator");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config({
  path: "../.env",
});

console.log("URL:", process.env.VITE_SUPABASE_URL);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

(async () => {
  try {
    const claimId = process.argv[2];

    if (!claimId) {
      throw new Error("Usage: node generate.cjs 443");
    }

    const { data: claim, error } = await supabase
      .from("insurance_claims")
      .select("*")
      .eq("claim_id", claimId)
      .single();

    if (error || !claim) {
      throw new Error(`Claim ${claimId} not found`);
    }

    const patientName = claim.patient_name || "";
    const remainingVisits = Number(
      claim.remaining_sessions || 0
    );

    const cardId = `PAT-${claim.claim_id}`;

    // 以后改成数据库里的授权截止日期
    const expirationDate =
  claim.end_date || "N/A";

    const pass = await PKPass.from(
      {
        model: "./model.pass",
        certificates: {
          wwdr: fs.readFileSync(
            "./certs/wwdr.pem"
          ),
          signerCert: fs.readFileSync(
            "./certs/signerCert.pem"
          ),
          signerKey: fs.readFileSync(
            "./certs/signerKeyNoPass.pem"
          ),
        },
      },
      {
        serialNumber: cardId,
      }
    );

    // TOP WARNING
if (remainingVisits <= 2) {
  pass.headerFields.push({
    key: "warning",
    label: "",
    value: "⚠ RENEW SOON",
  });
}

pass.primaryFields.push({
  key: "end_date",
  label: "EXPIRATION DATE",
  value: expirationDate,
});

pass.secondaryFields.push({
  key: "patient",
  label: `CLIENT ${cardId}`,
  value: claim.patient_name || "Client",
});

pass.auxiliaryFields.push({
  key: "phone",
  label: "PHONE",
  value: "808-528-7177",
});
  pass.setBarcodes({
  message: cardId,
  format: "PKBarcodeFormatQR",
});

fs.writeFileSync(
  `${cardId}.pkpass`,
  pass.getAsBuffer()
);

const { error: updateError } = await supabase
  .from("insurance_claims")
  .update({
    wallet_id: cardId,
    qr_code: cardId,
    wallet_created: true,
    wallet_created_at: new Date().toISOString(),
  })
  .eq("claim_id", claimId);

console.log("UPDATE RESULT:", updateError);
console.log(`Created ${cardId}.pkpass`);
console.log(`Patient: ${patientName}`);
console.log(`Expiration Date: ${expirationDate}`);

  } catch (err) {
    console.error(err);
  }
})();