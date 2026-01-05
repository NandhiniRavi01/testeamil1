import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FiPlus, FiEdit2, FiRefreshCw, FiEye, FiCheck, FiX, FiMail, FiSettings } from "react-icons/fi";
import "./AutoMailTab.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "https://emailagent.cubegtp.com/";

export default function AutoMailTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [showCampaignTplModal, setShowCampaignTplModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campaignTpl, setCampaignTpl] = useState({ subject: "", body: "" });
  const [savingCampaignTpl, setSavingCampaignTpl] = useState(false);

  const [showDefaultTplModal, setShowDefaultTplModal] = useState(false);
  const [defaultTpl, setDefaultTpl] = useState({ subject: "", body: "" });
  const [savingDefaultTpl, setSavingDefaultTpl] = useState(false);

  const makeAuthRequest = useCallback(async (url, options = {}) => {
    const opts = {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    };
    const res = await fetch(url, opts);
    if (res.status === 401) {
      window.alert("Session expired. Please log in again.");
      window.location.href = "/";
      return { error: "unauthorized" };
    }
    return res;
  }, []);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await makeAuthRequest(`${API_BASE_URL}/tracking/campaigns`);
      if (res.error) return;
      if (!res.ok) throw new Error("Failed to load campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
      setPage(1);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [makeAuthRequest]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Prevent background scroll when any modal is open
  useEffect(() => {
    const anyOpen = showCampaignTplModal || showDefaultTplModal;
    const prev = document.body.style.overflow;
    if (anyOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showCampaignTplModal, showDefaultTplModal]);

  const openCampaignTpl = async (campaign) => {
    setEditingCampaign(campaign);
    setCampaignTpl({ subject: "", body: "" });
    setShowCampaignTplModal(true);
    try {
      const res = await makeAuthRequest(`${API_BASE_URL}/tracking/auto-reply/template?campaign_id=${campaign.campaign_id}`);
      if (res.error) return;
      if (res.ok) {
        const data = await res.json();
        if (data.subject || data.body) {
          setCampaignTpl({ subject: data.subject || "", body: data.body || "" });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveCampaignTpl = async () => {
    if (!editingCampaign) return;
    if (!campaignTpl.subject || !campaignTpl.body) {
      window.alert("Subject and Body are required");
      return;
    }
    setSavingCampaignTpl(true);
    try {
      const res = await makeAuthRequest(`${API_BASE_URL}/tracking/auto-reply/template`, {
        method: "POST",
        body: JSON.stringify({
          campaign_id: editingCampaign.campaign_id,
          subject: campaignTpl.subject,
          body: campaignTpl.body,
        }),
      });
      if (res.error) return;
      if (!res.ok) throw new Error("Failed to save template");
      setShowCampaignTplModal(false);
      setEditingCampaign(null);
      await fetchCampaigns();
    } catch (e) {
      console.error(e);
      window.alert(e.message || "Failed to save template");
    } finally {
      setSavingCampaignTpl(false);
    }
  };

  const openDefaultTpl = async () => {
    setShowDefaultTplModal(true);
    setDefaultTpl({ subject: "", body: "" });
    try {
      const res = await makeAuthRequest(`${API_BASE_URL}/tracking/auto-reply/template/default`);
      if (res.error) return;
      if (res.ok) {
        const data = await res.json();
        if (data.subject || data.body) {
          setDefaultTpl({ subject: data.subject || "", body: data.body || "" });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveDefaultTpl = async () => {
    if (!defaultTpl.subject || !defaultTpl.body) {
      window.alert("Subject and Body are required");
      return;
    }
    setSavingDefaultTpl(true);
    try {
      const res = await makeAuthRequest(`${API_BASE_URL}/tracking/auto-reply/template/default`, {
        method: "POST",
        body: JSON.stringify({ subject: defaultTpl.subject, body: defaultTpl.body }),
      });
      if (res.error) return;
      if (!res.ok) throw new Error("Failed to save default template");
      setShowDefaultTplModal(false);
      await fetchCampaigns();
    } catch (e) {
      console.error(e);
      window.alert(e.message || "Failed to save default template");
    } finally {
      setSavingDefaultTpl(false);
    }
  };

  const columns = useMemo(() => [
    { key: "campaign_name", title: "Campaign", width: "35%" },
    { key: "inbox_count", title: "Inbox", width: "10%" },
    { key: "replied_count", title: "Replied", width: "10%" },
    { key: "actions", title: "Actions", width: "23%" },
    { key: "template", title: "Auto Reply Template", width: "22%" },
  ], []);

  const totalPages = Math.max(1, Math.ceil(campaigns.length / pageSize));
  const currentSlice = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return campaigns.slice(start, end);
  }, [campaigns, page]);

  const goToPage = (p) => {
    const clamped = Math.min(Math.max(1, p), totalPages);
    setPage(clamped);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FiMail /> Auto Mail
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={fetchCampaigns} disabled={loading}>
            {loading ? <FiRefreshCw className="spin" /> : <FiRefreshCw />} Refresh
          </button>
          <button className="btn btn-primary" onClick={openDefaultTpl}>
            <FiSettings /> Default Template
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>
      )}

      <div className="card">
        <div className="card-header">Campaigns</div>
        <div className="card-content">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} style={{ width: c.width }}>{c.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{ textAlign: "center", padding: 24 }}>
                      {loading ? "Loading…" : "No campaigns found"}
                    </td>
                  </tr>
                )}
                {currentSlice.map((c) => (
                  <tr key={c.campaign_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.campaign_name}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>Status: {c.status}</div>
                    </td>
                    <td>{c.inbox_count ?? c.replied_count ?? 0}</td>
                    <td>{c.replied_count ?? 0}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-light" title="View replies" onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: { route: `/tracking/campaign/${c.campaign_id}` } }))}>
                          <FiEye /> View replies
                        </button>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {c.has_auto_reply_template ? (
                          <span className="badge badge-success">Set</span>
                        ) : (
                          <span className="badge">Not set</span>
                        )}
                        <button className="btn btn-primary" onClick={() => openCampaignTpl(c)}>
                          <FiPlus />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {campaigns.length > pageSize && (
              <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <div style={{ color: '#64748b', fontSize: 12 }}>
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, campaigns.length)} of {campaigns.length}
                </div>
                <div className="pagination-controls" style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
                    ◀ Prev
                  </button>
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}>
                    Page {page} / {totalPages}
                  </span>
                  <button className="btn" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
                    Next ▶
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCampaignTplModal && (
        <div className="history-modal-overlay" onClick={() => { setShowCampaignTplModal(false); setEditingCampaign(null); }}>
          <div className="history-modal-content" onClick={e => e.stopPropagation()}>
            <div className="history-modal-header">
              <h3>
                <FiEdit2 /> Auto Reply Template {editingCampaign ? `– ${editingCampaign.campaign_name}` : ""}
              </h3>
              <button className="close-modal-btn" onClick={() => { setShowCampaignTplModal(false); setEditingCampaign(null); }}>
                <FiX />
              </button>
            </div>
            <div className="history-modal-body">
              <div className="form-group">
                <label>Subject</label>
                <input
                  className="form-input"
                  placeholder="Subject"
                  value={campaignTpl.subject}
                  onChange={(e) => setCampaignTpl((s) => ({ ...s, subject: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Body</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  placeholder="Email body with optional placeholders like {{name}}"
                  value={campaignTpl.body}
                  onChange={(e) => setCampaignTpl((s) => ({ ...s, body: e.target.value }))}
                />
              </div>
              <div className="modal-footer">
                <button className="btn" onClick={() => { setShowCampaignTplModal(false); setEditingCampaign(null); }}>
                  <FiX /> Cancel
                </button>
                <button className="btn btn-primary" onClick={saveCampaignTpl} disabled={savingCampaignTpl}>
                  <FiCheck /> {savingCampaignTpl ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDefaultTplModal && (
        <div className="history-modal-overlay" onClick={() => setShowDefaultTplModal(false)}>
          <div className="history-modal-content" onClick={e => e.stopPropagation()}>
            <div className="history-modal-header">
              <h3>
                <FiSettings /> Default Auto Reply Template
              </h3>
              <button className="close-modal-btn" onClick={() => setShowDefaultTplModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="history-modal-body">
              <div className="form-group">
                <label>Subject</label>
                <input
                  className="form-input"
                  placeholder="Subject"
                  value={defaultTpl.subject}
                  onChange={(e) => setDefaultTpl((s) => ({ ...s, subject: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Body</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  placeholder="Email body with optional placeholders like {{name}}"
                  value={defaultTpl.body}
                  onChange={(e) => setDefaultTpl((s) => ({ ...s, body: e.target.value }))}
                />
              </div>
              <div className="modal-footer">
                <button className="btn" onClick={() => setShowDefaultTplModal(false)}>
                  <FiX /> Cancel
                </button>
                <button className="btn btn-primary" onClick={saveDefaultTpl} disabled={savingDefaultTpl}>
                  <FiCheck /> {savingDefaultTpl ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px; }
        .card-header { padding: 12px 16px; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
        .card-content { padding: 12px 16px; }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; }
        .table-responsive { overflow: auto; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 6px; border: 1px solid #d1d5db; background: #f9fafb; cursor: pointer; color: #111827; }
        .btn:hover { background: #f3f4f6; }
        .btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
        .btn-primary:hover { background: #1d4ed8; }
        .btn-secondary { background: #111827; color: #fff; border-color: #111827; }
        .btn-light { background: #fff; color: #111827; border-color: #d1d5db; }
        .btn svg { color: inherit; }
        .badge { display: inline-flex; padding: 2px 8px; background: #e5e7eb; border-radius: 999px; font-size: 12px; }
        .badge-success { background: #dcfce7; color: #166534; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
        /* Pagination */
        .pagination .btn { padding: 6px 10px; }
        .pagination .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        
        /* History Modal Styles */
        .history-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .history-modal-content {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 700px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          animation: slideUp 0.3s ease;
        }
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .history-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e2e8f0;
        }
        .history-modal-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .close-modal-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #64748b;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.2s ease;
        }
        .close-modal-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .history-modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
          margin-top: 16px;
        }
        .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
        .form-input, .form-textarea { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; font-family: inherit; }
        .form-textarea { resize: vertical; }
        .alert-error { background: #fee2e2; color: #7f1d1d; border: 1px solid #fecaca; border-radius: 6px; padding: 8px 12px; }
      `}</style>
    </div>
  );
}


