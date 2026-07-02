import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { createClient } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Preload audio indicators
const successSound = new Audio("/success.mp3");
const errorSound = new Audio("/error.mp3");

export default function ScanPage() {
  const navigate = useNavigate();
  const [scanActive, setScanActive] = useState(true);
  const [result, setResult] = useState<{
    type: "success" | "error";
    title: string;
    message: string;
  } | null>(null);

  const [statusMessage, setStatusMessage] = useState("Ready to scan...");

  useEffect(() => {
    if (!scanActive) return;

    const scanner = new Html5QrcodeScanner(
      "reader",
      {
        fps: 10,
        qrbox: 220,
      },
      false
    );

    const onScanSuccess = async (decodedText: string) => {
      console.log("SCANNED QR:", decodedText);
      
      // Stop scanner immediately to prevent duplicate reads
      setScanActive(false);
      setStatusMessage("Verifying credentials...");

      try {
        const { data, error } = await supabase
          .from("insurance_claims")
          .select("*")
          .eq("wallet_id", decodedText)
          .single();

        if (error || !data) {
          errorSound.play().catch(e => console.log("Audio play blocked:", e));
          setResult({
            type: "error",
            title: "Patient Not Found",
            message: `No active authorization found for Card ID: ${decodedText}.\n\nPlease register or consult the front desk.`
          });
          return;
        }

        const todayString = new Date().toISOString().slice(0, 10);
        if (data.end_date && data.end_date < todayString) {
          errorSound.play().catch(e => console.log("Audio play blocked:", e));
          setResult({
            type: "error",
            title: "Authorization Expired",
            message: `Patient: ${data.patient_name}\n\nExpiration Date: ${data.end_date}\n\nThis card's authorization period has ended. Please renew authorization before proceeding.`
          });
          return;
        }

        const remainingTreatments = data.remaining_sessions ?? data.number_of_treatments ?? 0;
        if (remainingTreatments <= 0) {
          errorSound.play().catch(e => console.log("Audio play blocked:", e));
          setResult({
            type: "error",
            title: "No Treatments Remaining",
            message: `Patient: ${data.patient_name}\n\nAll authorized sessions for this claim have been utilized.`
          });
          return;
        }

        // Decrement session count in the database
        const { error: rpcError } = await supabase.rpc("use_one_session", {
          p_claim_uuid: data.id,
        });

        if (rpcError) {
          errorSound.play().catch(e => console.log("Audio play blocked:", e));
          setResult({
            type: "error",
            title: "Check-in Error",
            message: rpcError.message || "Failed to update session balance."
          });
          return;
        }

        const nextRemaining = Math.max(0, remainingTreatments - 1);
        const timestamp = new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString();

        successSound.play().catch(e => console.log("Audio play blocked:", e));
        setResult({
          type: "success",
          title: "Check-in Successful",
          message: `Patient: ${data.patient_name}\nRemaining Sessions: ${nextRemaining}\n\nTimestamp: ${timestamp}`
        });

      } catch (err: any) {
        console.error("Scan error:", err);
        errorSound.play().catch(e => console.log("Audio play blocked:", e));
        setResult({
          type: "error",
          title: "System Error",
          message: err.message || "An unexpected error occurred during check-in."
        });
      }
    };

    const onScanFailure = () => {
      // Suppress spammy log outputs from camera scans
    };

    scanner.render(onScanSuccess, onScanFailure);
    setStatusMessage("Position your Wallet QR code inside the camera view");

    return () => {
      scanner.clear().catch((err) => {
        console.warn("Failed to clear html5-qrcode instance on unmount:", err);
      });
    };
  }, [scanActive]);

  // Handle automatic timeout close for check-in modals
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      closeResult();
    }, 6000);

    return () => clearTimeout(timer);
  }, [result]);

  const closeResult = () => {
    setResult(null);
    setScanActive(true);
    setStatusMessage("Ready to scan...");
  };

  return (
    <div className="kiosk-container">
      <div className="kiosk-card">
        <div className="kiosk-logo">➕</div>
        <h1 className="kiosk-title">AcuTherapy Clinics</h1>
        <p className="kiosk-subtitle">Self-Service Check-In</p>

        <div className="scanner-frame-wrapper">
          <div className="scanner-laser"></div>
          <div id="reader"></div>
        </div>

        <p className="kiosk-status-msg">{statusMessage}</p>

        <button className="btn btn-secondary" onClick={() => navigate("/")}>
          ← Back to Dashboard
        </button>
      </div>

      {result && (
        <div className="kiosk-overlay" onClick={closeResult}>
          <div className="kiosk-result-modal" onClick={(e) => e.stopPropagation()}>
            <div className="result-icon">
              {result.type === "success" ? "✅" : "❌"}
            </div>
            <h2 className={`result-title ${result.type}`}>
              {result.title}
            </h2>
            <p className="result-body">{result.message}</p>
            <button
              className={`btn ${result.type === "success" ? "btn-primary" : "btn-danger"}`}
              onClick={closeResult}
            >
              Continue
            </button>
            <div style={{ marginTop: "16px" }}>
              <span className="result-countdown">
                Returning to scanner in a few seconds...
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}