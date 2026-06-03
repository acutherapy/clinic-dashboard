import { useEffect, useState } from "react";
// import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@supabase/supabase-js";
import "./App.css";
import ScanPage from "./ScanPage";
type Claim = {
  id: string;
  patient_name?: string;
  session_referral?: string;
  number_of_treatments?: number;
  status?: string;
  notes?: string;
  wallet_id?: string;
  qr_code?: string;
  wallet_created?: boolean;
  last_scan?: string;

  claim_id?: number | string;
};

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL;

const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

const statusOptions = [
  "All",
  "Open",
  "Closed",
  "open",
  "closed",
  "active",
  "pending",
  "approved",
  "denied",
  "expired",
  "completed",
  "cancelled",
  "following_up",
  "rfs_acu",
  "rfs_mass",
  "dislike",
];

const notesOptions = [
  "All",
  "call",
  "text",
  "schedule",
  "need auth",
  "no answer",
  "done",
];

export default function App() {
  /*
  const _generateCard = async (claim: any) => {
  const cardId = `PAT-${claim.claim_id}`;

  const { error } = await supabase
    .from("insurance_claims")
    .update({
      wallet_id: cardId,
      qr_code: cardId,
      wallet_created: true,
    })
    .eq("id", claim.id);

  if (error) {
    alert("Error creating card");
    console.error(error);
    return;
  }

  alert(`Card Created: ${cardId}`);
};
*/
  const [scanMode, setScanMode] =
  useState(false);
  const [claims, setClaims] =
  useState<Claim[]>([]);
  const [statusFilter, setStatusFilter] =
    useState("active");

  const [notesFilter, setNotesFilter] =
    useState("All");

  const [sortColumn, setSortColumn] =
    useState("number_of_treatments");

  const [ascending, setAscending] =
    useState(true);

   const criticalCount = claims.filter(
  (c: any) => getClaimLevel(c) === "critical"
).length;

const warningCount = claims.filter(
  (c: any) => getClaimLevel(c) === "warning"
).length;

const goodCount = claims.filter(
  (c: any) => getClaimLevel(c) === "good"
).length;

function getClaimLevel(claim: any) {
  const sessionsLeft =
    claim.number_of_treatments ?? 0;

  if (!claim.end_date) return "warning";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = new Date(claim.end_date);
  endDate.setHours(0, 0, 0, 0);

  const daysLeft = Math.ceil(
    (endDate.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const sessionsPerWeekNeeded =
    daysLeft > 0
      ? (sessionsLeft / daysLeft) * 7
      : 999;

  if (
    daysLeft < 0 ||
    daysLeft <= 7 ||
    sessionsPerWeekNeeded >= 3
  ) {
    return "critical";
  }

  if (
    daysLeft <= 14 ||
    sessionsPerWeekNeeded >= 2
  ) {
    return "warning";
  }

  return "good";
}
  async function loadClaims() {
    let query = supabase
      .from("insurance_claims")
      .select("*");

    if (statusFilter !== "All") {
  query = query.or(
    `status.eq.${statusFilter},session_referral.eq.rfs_acu,session_referral.eq.rfs_mass`
  );
}

    if (notesFilter !== "All") {
      query = query.eq(
        "notes",
        notesFilter
      );
    }

 query = query.order(sortColumn, {
  ascending,
});

    const { data, error } = await query;

    if (error) {
  console.error(
    "Supabase error:",
    error.message
  );
  return;
}

setClaims(data || []);
  }

  async function useOneSession(
    claimId: string,
    patientName: string
  ) {
    const ok = window.confirm(
      `Use 1 session for ${patientName}?`
    );
const claim = claims.find((c) => c.id === claimId);

if (!claim) {
  alert("Claim not found");
  return;
}

const remaining =
  (claim as any).remaining_sessions ??
  (claim as any).number_of_treatments ??
  0;

if (remaining <= 0) {
  alert("No remaining sessions.");
  return;
}

    if (!ok) return;

    const { error } = await supabase.rpc(
      "use_one_session",
      {
        p_claim_uuid: claimId,
      }
    );

    if (error) {
      alert(error.message);
      return;
    }

    await loadClaims();
  }

  function handleSort(column: string) {
    if (sortColumn === column) {
      setAscending(!ascending);
    } else {
      setSortColumn(column);
      setAscending(true);
    }
  }

  function sortLabel(column: string) {
    if (sortColumn !== column) return "";
    return ascending ? " ↑" : " ↓";
  }

  useEffect(() => {
    loadClaims();

    const channel = supabase
      .channel(
        "insurance-claims-realtime"
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "insurance_claims",
        },
        () => loadClaims()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    statusFilter,
    notesFilter,
    sortColumn,
    ascending,
  ]);

if (scanMode) {
  return (
    <div>
      <button
        onClick={() =>
          setScanMode(false)
        }
      >
        Back to Dashboard
      </button>

      <ScanPage />
    </div>
  );
}

  return (
    <div className="dashboard">
      <h1>Insurance Dashboard</h1>
<button
  onClick={() =>
    setScanMode(true)
  }
>
  📷 Scan QR
</button>
      <div className="filters">
        <label>
          Status:
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value
              )
            }
          >
            {statusOptions.map(
              (status) => (
                <option
                  key={status}
                  value={status}
                >
                  {status}
                </option>
              )
            )}
          </select>
        </label>

        <label>
          Notes:
          <select
            value={notesFilter}
            onChange={(e) =>
              setNotesFilter(
                e.target.value
              )
            }
          >
            {notesOptions.map(
              (note) => (
                <option
                  key={note}
                  value={note}
                >
                  {note}
                </option>
              )
            )}
          </select>
        </label>
      </div>

      <div className="count">
  Showing {claims.length} records
</div>

<div className="stats">
  <div className="card critical">
    🔴 Critical
    <br />
    {criticalCount}
  </div>

  <div className="card warning">
    🟡 Warning
    <br />
    {warningCount}
  </div>

  <div className="card good">
    🟢 Good
    <br />
    {goodCount}
  </div>

  <div className="card total">
    📋 Total
    <br />
    {claims.length}
  </div>
</div>

      <table>
        <thead>
  <tr>
    <th onClick={() => handleSort("patient_name")}>
      Patient
      {sortLabel("patient_name")}
    </th>

    <th onClick={() => handleSort("session_referral")}>
      Session Referral
      {sortLabel("session_referral")}
    </th>

    <th
      onClick={() =>
        handleSort("number_of_treatments")
      }
    >
      Treatments
      {sortLabel(
        "number_of_treatments"
      )}
    </th>

    <th>Priority</th>

    <th>Need Action</th>

    <th>Action</th>

    <th onClick={() => handleSort("status")}>
      Status
      {sortLabel("status")}
    </th>

    <th>Wallet</th>

    <th onClick={() => handleSort("notes")}>
      Notes
      {sortLabel("notes")}
    </th>
  </tr>
</thead>

<tbody>
  {claims.map((claim) => (
    <tr
      key={claim.id}
      className={
  getClaimLevel(claim) === "critical"
    ? "row-critical"
    : getClaimLevel(claim) === "warning"
    ? "row-warning"
    : ""
}
    >
      {/* Patient */}
      <td>{claim.patient_name || ""}</td>

      {/* Session Referral */}
      <td>
        {claim.session_referral || ""}
      </td>

      {/* Treatments */}
      <td>
        <span
          style={{
            color:
              (claim.number_of_treatments ??
                0) <= 2
                ? "red"
                : "black",
            fontWeight:
              (claim.number_of_treatments ??
                0) <= 2
                ? "bold"
                : "normal",
            fontSize:
              (claim.number_of_treatments ??
                0) <= 2
                ? "20px"
                : "16px",
          }}
        >
          {claim.number_of_treatments ??
            ""}
        </span>
      </td>

      {/* Priority */}
      <td>
        {(claim.number_of_treatments ??
          0) === 0 ? (
          <span className="renew-now">
            🚨 RENEW NOW
          </span>
        ) : (claim.number_of_treatments ??
            0) <=
          2 ? (
          <span className="critical-text">
            🔴 Critical
          </span>
        ) : (claim.number_of_treatments ??
            0) <=
          5 ? (
          <span className="warning-text">
            🟡 Warning
          </span>
        ) : (
          <span className="good-text">
            🟢 Good
          </span>
        )}
      </td>

      {/* Need Action */}
      <td>
        {(claim.number_of_treatments ??
          0) === 0
          ? "🚨 Renew Authorization"
          : (claim.number_of_treatments ??
              0) <=
            2
          ? "📞 Call Patient"
          : (claim.number_of_treatments ??
              0) <=
            5
          ? "⚠ Monitor"
          : "✅ OK"}
      </td>

      {/* Action */}
      <td>
        <button
          className={
            (claim.number_of_treatments ??
              0) === 0
              ? "renew-button"
              : ""
          }
          onClick={() =>
            useOneSession(
              claim.id,
              claim.patient_name ?? ""
            )
          }
        >
          Use 1 Session
        </button>
      </td>

      {/* Status */}
      <td>
        {claim.status || ""}
      </td>

      {/* Wallet */}
   <td>
  {claim.wallet_created ? (
    <button
      className="wallet-created"
      onClick={() =>
        window.open(
          `/api/wallet/${claim.claim_id}`,
          "_blank"
        )
      }
    >
      ✅ Created
    </button>
  ) : (
    <button
      className="wallet-button"
      onClick={() =>
        window.open(
          `/api/wallet/${claim.claim_id}`,
          "_blank"
        )
      }
    >
      📱 Wallet
    </button>
  )}
</td>

      {/* Notes */}
      <td>
        {claim.notes || ""}
      </td>
    </tr>
  ))}
</tbody>
      </table>
    </div>
  );
}
console.log(
  import.meta.env.VITE_SUPABASE_URL
);