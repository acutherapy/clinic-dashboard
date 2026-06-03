let scannerInitialized = false;

import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
const successSound = new Audio(
  "/success.mp3"
);

const errorSound = new Audio(
  "/error.mp3"
);

export default function ScanPage() {
  const [message, setMessage] =
    useState("Ready to scan...");

  useEffect(() => {

  if (scannerInitialized) {
    return;
  }

  scannerInitialized = true;
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
        console.log("SCANNED QR:", decodedText);
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
      "claim_id",
      decodedText
    )
    .single();

          if (error || !data) {

  errorSound.play();

  setMessage(
    "❌ Patient not found"
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

  errorSound.play();

  setMessage(
    result.error.message
  );

  return;
}

       const remaining =
  Math.max(
    0,
    (data.number_of_treatments ?? 1) - 1
  );

const now = new Date();

const timestamp =
  now.toLocaleDateString() +
  " " +
  now.toLocaleTimeString();


successSound.play();
  setMessage(`
✅ CHECK-IN SUCCESS

${data.patient_name}

Remaining Visits: ${remaining}

Last Visit:
${timestamp}
`);

setTimeout(() => {
  window.location.reload();
}, 15000);

        } catch (err) {

  console.error(err);

  errorSound.play();

  setMessage(
    "❌ Scan failed"
  );
}
      },
      () => {}
    );

    return () => {
  scannerInitialized = false;
  scanner.clear().catch(() => {});
};
  }, []);

  return (
    <div
      style={{
        padding: "20px",
      }}
    >
      <h1
  style={{
    textAlign: "center",
    fontSize: "36px",
  }}
>
  AcuTherapy Clinic
  <br />
  Patient Check-In
</h1>

      <div id="reader" className="scan-page"></div>

      <pre
  style={{
    fontSize: "24px",
    fontWeight: "bold",
    color: "green",
    whiteSpace: "pre-wrap",
    textAlign: "center",
    marginTop: "30px",
  }}
>
  {message}
</pre>
    </div>
  );
}