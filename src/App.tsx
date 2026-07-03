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
  provider?: string;
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
  "Renew Auth",
];

const classPresets = [
  "VA-A",
  "VA-M",
  "WC-A",
  "WC-M",
  "AC-A",
  "AC-M",
  "AARP",
  "AARP-UHC",
  "ASHLink-HMSA",
  "ASHLink-Kaiser",
  "UHA",
  "HMAA",
  "Selfpay",
  "Pack6",
  "Pack12",
  "Pack18",
  "Pack24",
  "Other"
];

const providerOptions = [
  "Kai",
  "David",
  "Lisa",
  "Aya",
  "Motomi",
  "Hiromi",
  "Miharu",
];

export default function App() {
  const navigate = useNavigate();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [statusFilter, setStatusFilter] = useState("active");
  const [providerFilter, setProviderFilter] = useState("All");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [sortColumn, setSortColumn] = useState("remaining_sessions");
  const [ascending, setAscending] = useState(true);
  const [classOptions, setClassOptions] = useState<string[]>(["All"]);

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

  async function loadClassOptions() {
    const { data, error } = await supabase
      .from("insurance_claims")
      .select("notes");

    if (error) {
      console.error("Error loading class options:", error.message);
      return;
    }

    if (data) {
      const uniqueDb = Array.from(
        new Set(data.map((d: any) => d.notes).filter(Boolean))
      ) as string[];
      // Combine predefined classPresets and unique notes from the database
      const combined = Array.from(new Set([...classPresets, ...uniqueDb]));
      combined.sort((a, b) => a.localeCompare(b));
      setClassOptions(["All", ...combined]);
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

    if (selectedClasses.length > 0) {
      query = query.in("notes", selectedClasses);
    }

    if (providerFilter !== "All") {
      if (providerFilter === "No Provider") {
        query = query.or("provider.is.null,provider.eq.");
      } else {
        query = query.eq("provider", providerFilter);
      }
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
    const ok = window.confirm(`Check in ${patientName}?`);
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

  async function handleUpdateStatus(claimId: string, newStatus: string) {
    // Optimistically update local state
    setClaims((prev) =>
      prev.map((c) => (c.id === claimId ? { ...c, status: newStatus } : c))
    );

    const { error } = await supabase
      .from("insurance_claims")
      .update({ status: newStatus })
      .eq("id", claimId);

    if (error) {
      alert("Failed to update status: " + error.message);
      // Revert to database state on failure
      loadClaims();
    }
  }

  async function handleUpdateClass(claimId: string, newValue: string, oldValue: string) {
    if (newValue === oldValue) return;

    // Optimistically update local state
    setClaims((prev) =>
      prev.map((c) => (c.id === claimId ? { ...c, notes: newValue || undefined } : c))
    );

    const { error } = await supabase
      .from("insurance_claims")
      .update({ notes: newValue || null })
      .eq("id", claimId);

    if (error) {
      alert("Failed to update class: " + error.message);
      // Revert to database state on failure
      loadClaims();
    } else {
      loadClassOptions();
    }
  }

  async function handleUpdateEndDate(claimId: string, newEndDate: string) {
    // Optimistically update local state
    setClaims((prev) =>
      prev.map((c) => (c.id === claimId ? { ...c, end_date: newEndDate || undefined } : c))
    );

    const { error } = await supabase
      .from("insurance_claims")
      .update({ end_date: newEndDate || null })
      .eq("id", claimId);

    if (error) {
      alert("Failed to update expiration date: " + error.message);
      // Revert on failure
      loadClaims();
    }
  }

  async function handleUpdateRemainingSessions(claimId: string, newCount: number) {
    // Optimistically update local state
    setClaims((prev) =>
      prev.map((c) =>
        c.id === claimId
          ? {
              ...c,
              remaining_sessions: newCount,
              // If number_of_treatments is not set, set it too so we don't have mismatch
              number_of_treatments: c.number_of_treatments ?? newCount,
            }
          : c
      )
    );

    const { error } = await supabase
      .from("insurance_claims")
      .update({
        remaining_sessions: newCount,
      })
      .eq("id", claimId);

    if (error) {
      alert("Failed to update treatments: " + error.message);
      // Revert on failure
      loadClaims();
    }
  }

  async function handleUpdateProvider(claimId: string, newProvider: string) {
    // Optimistically update local state
    setClaims((prev) =>
      prev.map((c) => (c.id === claimId ? { ...c, provider: newProvider || undefined } : c))
    );

    const { error } = await supabase
      .from("insurance_claims")
      .update({ provider: newProvider || null })
      .eq("id", claimId);

    if (error) {
      alert("Failed to update provider: " + error.message);
      // Revert on failure
      loadClaims();
    }
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
    loadClassOptions();
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
          loadClassOptions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter, selectedClasses, providerFilter, sortColumn, ascending]);

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

          <label className="filter-item">
            Provider:
            <select
              className="filter-select"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
            >
              <option value="All">All</option>
              <option value="No Provider">No Provider</option>
              {providerOptions.map((prov) => (
                <option key={prov} value={prov}>
                  {prov}
                </option>
              ))}
            </select>
          </label>

          <div className="filter-item">
            Class:
            <div className="multiselect-container" ref={dropdownRef}>
              <button
                type="button"
                className="multiselect-trigger"
                onClick={() => setIsOpen(!isOpen)}
              >
                {selectedClasses.length === 0
                  ? "All"
                  : selectedClasses.length === 1
                  ? selectedClasses[0]
                  : `${selectedClasses.length} Selected`}
                <span>▼</span>
              </button>

              {isOpen && (
                <div className="multiselect-dropdown">
                  <div className="multiselect-actions">
                    <button
                      type="button"
                      className="multiselect-action-btn"
                      onClick={() => setSelectedClasses([])}
                    >
                      Clear All
                    </button>
                    <button
                      type="button"
                      className="multiselect-action-btn"
                      onClick={() => {
                        const allDbClasses = classOptions.filter(c => c !== "All");
                        setSelectedClasses(allDbClasses);
                      }}
                    >
                      Select All
                    </button>
                  </div>
                  {classOptions
                    .filter((cls) => cls !== "All")
                    .map((cls) => (
                      <div className="multiselect-option" key={cls}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedClasses.includes(cls)}
                            onChange={() => {
                              if (selectedClasses.includes(cls)) {
                                setSelectedClasses(
                                  selectedClasses.filter((c) => c !== cls)
                                );
                              } else {
                                setSelectedClasses([...selectedClasses, cls]);
                              }
                            }}
                          />
                          {cls}
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
              <th onClick={() => handleSort("remaining_sessions")}>
                Treatments{sortLabel("remaining_sessions")}
              </th>
              <th>Priority</th>
              <th>Need Action</th>
              <th>Check</th>
              <th onClick={() => handleSort("provider")}>
                Provider{sortLabel("provider")}
              </th>
              <th onClick={() => handleSort("status")}>
                Status{sortLabel("status")}
              </th>
              <th>Wallet</th>
              <th onClick={() => handleSort("notes")}>
                Class{sortLabel("notes")}
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
                  <td>
                    <input
                      type="date"
                      className="inline-date-input"
                      value={claim.end_date || ""}
                      onChange={(e) => handleUpdateEndDate(claim.id, e.target.value)}
                    />
                  </td>

                  {/* Treatments */}
                  <td>
                    <input
                      type="number"
                      className={`inline-number-input ${
                        remainingTreatments <= 2 ? "low" : ""
                      }`}
                      value={remainingTreatments}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        handleUpdateRemainingSessions(claim.id, isNaN(val) ? 0 : val);
                      }}
                      min="0"
                    />
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
                      Check-in
                    </button>
                  </td>

                  {/* Provider */}
                  <td>
                    <select
                      className="inline-select"
                      value={claim.provider || ""}
                      onChange={(e) => handleUpdateProvider(claim.id, e.target.value)}
                    >
                      <option value="">No Provider</option>
                      {providerOptions.map((prov) => (
                        <option key={prov} value={prov}>
                          {prov}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Status */}
                  <td>
                    <select
                      className="inline-select"
                      value={claim.status || ""}
                      onChange={(e) => handleUpdateStatus(claim.id, e.target.value)}
                    >
                      {statusOptions
                        .filter((opt) => opt !== "All")
                        .map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                    </select>
                  </td>

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

                  {/* Class */}
                  <td>
                    <select
                      className="inline-select"
                      value={claim.notes || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "__CUSTOM__") {
                          const customVal = prompt("Enter custom class:", claim.notes || "");
                          if (customVal !== null) {
                            handleUpdateClass(claim.id, customVal, claim.notes || "");
                          }
                        } else {
                          handleUpdateClass(claim.id, val, claim.notes || "");
                        }
                      }}
                    >
                      <option value="">No Class</option>
                      {classPresets.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                      {claim.notes && !classPresets.includes(claim.notes) && (
                        <option key={claim.notes} value={claim.notes}>
                          {claim.notes}
                        </option>
                      )}
                      <option value="__CUSTOM__">✍️ Custom Class...</option>
                    </select>
                  </td>
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