import fs from "fs";
import path from "path";
import { PKPass } from "passkit-generator";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    const { claimId } = req.query;

    if (!claimId) {
      return res.status(400).send("Missing claimId");
    }

    const { data: claim, error } = await supabase
      .from("insurance_claims")
      .select("*")
      .eq("claim_id", String(claimId))
      .single();

    if (error || !claim) {
      return res.status(404).send(`Claim ${claimId} not found`);
    }

    const cardId = `PAT-${claim.claim_id}`;
    const remainingVisits = Number(claim.remaining_sessions || 0);
    const expirationDate = claim.end_date || "N/A";

    const walletDir = path.join(process.cwd(), "wallet");

    const pass = await PKPass.from(
      {
        model: path.join(walletDir, "model.pass"),
        certificates: {
          wwdr: fs.readFileSync(
            path.join(walletDir, "certs", "wwdr.pem")
          ),
          signerCert: fs.readFileSync(
            path.join(walletDir, "certs", "signerCert.pem")
          ),
          signerKey: fs.readFileSync(
            path.join(walletDir, "certs", "signerKeyNoPass.pem")
          ),
        },
      },
      {
        serialNumber: cardId,
      }
    );

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

    const buffer = pass.getAsBuffer();

    await supabase
      .from("insurance_claims")
      .update({
        wallet_id: cardId,
        qr_code: cardId,
        wallet_created: true,
        wallet_created_at: new Date().toISOString(),
      })
      .eq("claim_id", String(claimId));

    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${cardId}.pkpass"`
    );

    return res.status(200).send(buffer);
  } catch (err) {
    console.error("Wallet API error:", err);
    return res.status(500).send(err.message || "Wallet API error");
  }
}