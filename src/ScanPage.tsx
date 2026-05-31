import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function ScanPage() {
  const [message, setMessage] =
    useState("Ready to scan...");

  useEffect(() => {
    const scanner =
      new Html5QrcodeScanner(
        "reader",
        {
          fps: 10,
          qrbox: 250,
        },
        false
      );

    scanner.render(
      async (decodedText) => {
        try {
          scanner.clear();

          setMessage(
            `Scanning ${decodedText}...`
          );

          const { data, error } =
            await supabase
              .from("insurance_claims")
              .select("*")
              .eq(
                "wallet_id",
                decodedText
              )
              .single();

          if (error || !data) {
            setMessage(
              "Patient not found"
            );
            return;
          }

          const result =
            await supabase.rpc(
              "use_one_session",
              {
                p_claim_uuid: data.id,
              }
            );

          if (result.error) {
            setMessage(
              result.error.message
            );
            return;
          }

          setMessage(
            `✅ Checked In: ${data.patient_name}`
          );
        } catch (err) {
          console.error(err);
          setMessage(
            "Scan failed"
          );
        }
      },
      () => {}
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, []);

  return (
    <div
      style={{
        padding: "20px",
      }}
    >
      <h1>
        Patient Check-In
      </h1>

      <div id="reader"></div>

      <h2>{message}</h2>
    </div>
  );
}