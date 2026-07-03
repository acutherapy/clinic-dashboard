import { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { Routes, Route, useNavigate } from "react-router-dom";
import "./App.css";
import ScanPage from "./ScanPage";

type Claim = {
  id: string;
  patient_name?: string;
  session_referral?: string;
  number_of_treatments?: number;
  remaining_sessions?: number;
  status?: string;
  notes?: string;
  wallet_id?: string;
  qr_code?: string;
  wallet_created?: boolean;
  last_scan?: string;
  end_date?: string;
  claim_id?: number | string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const statusOptions = [
  "All",
  "Open",
  "Closed",
  "active",
  "pending",
  "cancelled",
  "Awaiting Review",
  "B6",
  "RFS",
  "Waiting for Schedule",
];

export default function App() {
  const navigate = useNavigate();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [statusFilter, setStatusFilter] = useState("active");
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [sortColumn, setSortColumn] = useState("number_of_treatments");
  const [ascending, setAscending] = useState(true);
  const [notesOptions, setNotesOptions] = useState<string[]>(["All"]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  async function loadNotesOptions() {
    const { data, error } = await supabase
      .from("insurance_claims")
      .select("notes");

    if (error) {
      console.error("Error loading notes options:", error.message);
      return;
    }

    if (data) {
      const unique = Array.from(
        new Set(data.map((d: any) => d.notes).filter(Boolean))
      ) as string[];
      unique.sort((a, b) => a.localeCompare(b));
      setNotesOptions(["All", ...unique]);
    }
  }


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
    const status = (claim.status || "").toLowerCase();
    if (status === "closed" || status === "cancelled") {
      return "good";
    }

    const sessionsLeft = claim.remaining_sessions ?? claim.number_of_treatments ?? 0;

    if (sessionsLeft <= 0) {
      return "critical";
    }

    if (!claim.end_date) {
      return sessionsLeft <= 2 ? "critical" : "warning";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(claim.end_date);
    endDate.setHours(0, 0, 0, 0);

    const daysLeft = Math.ceil(
      (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysLeft < 0) {
      return "critical";
    }

    const sessionsPerWeekNeeded =
      daysLeft > 0 ? (sessionsLeft / daysLeft) * 7 : 999;

    if (daysLeft <= 7 || sessionsPerWeekNeeded >= 3) {
      return "critical";
    }

    if (daysLeft <= 14 || sessionsLeft <= 2 || sessionsPerWeekNeeded >= 2) {
      return "warning";
    }

    return "good";
  }


  async function loadClaims() {
    let query = supabase.from("insurance_claims").select("*");

    if (statusFilter !== "All") {
      query = query.or(
        `status.eq.${statusFilter},session_referral.eq.rfs_acu,session_referral.eq.rfs_mass`
      );
    }

    if (selectedNotes.length > 0) {
      query = query.in("notes", selectedNotes);
    }

    query = query.order(sortColumn, {
      ascending,
    });

    const { data, error } = await query;

    if (error) {
      console.error("Supabase error:", error.message);
      return;
    }

    setClaims(data || []);
  }

  async function useOneSession(claimId: string, patientName: string) {
    const ok = window.confirm(`Use 1 session for ${patientName}?`);
    const claim = claims.find((c) => c.id === claimId);

    if (!claim) {
      alert("Claim not found");
      return;
    }

    const remaining = claim.remaining_sessions ?? claim.number_of_treatments ?? 0;

    if (remaining <= 0) {
      alert("No remaining sessions.");
      return;
    }

    if (!ok) return;

    const { error } = await supabase.rpc("use_one_session", {
      p_claim_uuid: claimId,
    });

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
    loadNotesOptions();
  }, []);

  useEffect(() => {
    loadClaims();

    const channel = supabase
      .channel("insurance-claims-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "insurance_claims",
        },
        () => {
          loadClaims();
          loadNotesOptions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter, selectedNotes, sortColumn, ascending]);

  const dashboardView = (
    <div className="container">
      <header className="header-bar">
        <div className="brand-section">
          <div className="brand-logo-container">➕</div>
          <div className="brand-info">
            <h1 className="brand-title">AcuTherapy Clinics</h1>
            <p className="brand-subtitle">Insurance Claims Dashboard</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => navigate("/scan")}>
            📷 Scan QR Code
          </button>
        </div>
      </header>

      {/* KPI Stats Grid */}
      <section className="stats-grid">
        <div className="kpi-card critical">
          <span className="kpi-label">🔴 Critical</span>
          <div className="kpi-value-container">
            <span className="kpi-value">{criticalCount}</span>
            <span className="kpi-badge">Urgent</span>
          </div>
        </div>
        <div className="kpi-card warning">
          <span className="kpi-label">🟡 Warning</span>
          <div className="kpi-value-container">
            <span className="kpi-value">{warningCount}</span>
            <span className="kpi-badge">Monitor</span>
          </div>
        </div>
        <div className="kpi-card good">
          <span className="kpi-label">🟢 Good</span>
          <div className="kpi-value-container">
            <span className="kpi-value">{goodCount}</span>
            <span className="kpi-badge">Stable</span>
          </div>
        </div>
        <div className="kpi-card total">
          <span className="kpi-label">📋 Total</span>
          <div className="kpi-value-container">
            <span className="kpi-value">{claims.length}</span>
            <span className="kpi-badge">Active</span>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filters-group">
          <label className="filter-item">
            Status:
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <div className="filter-item">
            Notes:
            <div className="multiselect-container" ref={dropdownRef}>
              <button
                type="button"
                className="multiselect-trigger"
                onClick={() => setIsOpen(!isOpen)}
              >
                {selectedNotes.length === 0
                  ? "All"
                  : selectedNotes.length === 1
                  ? selectedNotes[0]
                  : `${selectedNotes.length} Selected`}
                <span>▼</span>
              </button>

              {isOpen && (
                <div className="multiselect-dropdown">
                  <div className="multiselect-actions">
                    <button
                      type="button"
                      className="multiselect-action-btn"
                      onClick={() => setSelectedNotes([])}
                    >
                      Clear All
                    </button>
                    <button
                      type="button"
                      className="multiselect-action-btn"
                      onClick={() => {
                        const allDbNotes = notesOptions.filter(n => n !== "All");
                        setSelectedNotes(allDbNotes);
                      }}
                    >
                      Select All
                    </button>
                  </div>
                  {notesOptions
                    .filter((note) => note !== "All")
                    .map((note) => (
                      <div className="multiselect-option" key={note}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedNotes.includes(note)}
                            onChange={() => {
                              if (selectedNotes.includes(note)) {
                                setSelectedNotes(
                                  selectedNotes.filter((n) => n !== note)
                                );
                              } else {
                                setSelectedNotes([...selectedNotes, note]);
                              }
                            }}
                          />
                          {note}
                        </label>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <span className="record-count">Showing {claims.length} records</span>
      </div>

      {/* Table Section */}
      <div className="table-container">
        <table className="premium-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("patient_name")}>
                Patient{sortLabel("patient_name")}
              </th>
              <th onClick={() => handleSort("end_date")}>
                Expiration Date{sortLabel("end_date")}
              </th>
              <th onClick={() => handleSort("number_of_treatments")}>
                Treatments{sortLabel("number_of_treatments")}
              </th>
              <th>Priority</th>
              <th>Need Action</th>
              <th>Action</th>
              <th onClick={() => handleSort("status")}>
                Status{sortLabel("status")}
              </th>
              <th>Wallet</th>
              <th onClick={() => handleSort("notes")}>
                Notes{sortLabel("notes")}
              </th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => {
              const claimLevel = getClaimLevel(claim);
              const remainingTreatments = claim.remaining_sessions ?? claim.number_of_treatments ?? 0;
              return (
                <tr
                  key={claim.id}
                  className={
                    claimLevel === "critical"
                      ? "row-critical"
                      : claimLevel === "warning"
                      ? "row-warning"
                      : ""
                  }
                >
                  {/* Patient */}
                  <td>
                    <span className="patient-name-text">
                      {claim.patient_name || "Unknown Patient"}
                    </span>
                  </td>

                  {/* Expiration Date */}
                  <td>{claim.end_date || "N/A"}</td>

                  {/* Treatments */}
                  <td>
                    <span
                      className={`treatment-count-text ${
                        remainingTreatments <= 2 ? "low" : ""
                      }`}
                    >
                      {remainingTreatments}
                    </span>
                  </td>

                  {/* Priority */}
                  <td>
                    <span className={`status-pill ${claimLevel}`}>
                      <span className="status-dot"></span>
                      {claimLevel === "critical"
                        ? "Critical"
                        : claimLevel === "warning"
                        ? "Warning"
                        : "Good"}
                    </span>
                  </td>

                  {/* Need Action */}
                  <td>
                    {remainingTreatments === 0 ? (
                      <span className="action-needed-badge renew">🚨 Renew Auth</span>
                    ) : remainingTreatments <= 2 ? (
                      <span className="action-needed-badge call">📞 Call Patient</span>
                    ) : remainingTreatments <= 5 ? (
                      <span className="action-needed-badge monitor">⚠ Monitor</span>
                    ) : (
                      <span className="action-needed-badge ok">✅ OK</span>
                    )}
                  </td>

                  {/* Action */}
                  <td>
                    <button
                      className={`btn btn-action ${remainingTreatments === 0 ? "btn-danger" : ""}`}
                      onClick={() => useOneSession(claim.id, claim.patient_name ?? "")}
                    >
                      Use 1 Session
                    </button>
                  </td>

                  {/* Status */}
                  <td>{claim.status || ""}</td>

                  {/* Wallet */}
                  <td>
                    {claim.wallet_created ? (
                      <a
                        className="wallet-cell-btn created"
                        href={`/api/wallet/${claim.claim_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ✅ Created
                      </a>
                    ) : (
                      <a
                        className="wallet-cell-btn"
                        href={`/api/wallet/${claim.claim_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        📱 Wallet
                      </a>
                    )}
                  </td>

                  {/* Notes */}
                  <td>{claim.notes || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={dashboardView} />
      <Route path="/scan" element={<ScanPage />} />
    </Routes>
  );
}