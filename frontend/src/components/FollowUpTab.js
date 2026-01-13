import React, { useEffect, useState } from "react";
import { FiClock, FiRefreshCw } from "react-icons/fi";
import "./FollowUpTab.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "https://emailagent.cubegtp.com";

// Helper function to make authenticated requests
const makeAuthenticatedRequest = async (url, options = {}) => {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
};

function FollowUpTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadFollowUps = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/follow-up-campaigns`);
        const data = await res.json();
        const list = Array.isArray(data?.campaigns)
          ? data.campaigns
          : Array.isArray(data)
            ? data
            : [];
        setCampaigns(list);
      } catch (e) {
        setError("Failed to load follow-up campaigns");
      } finally {
        setLoading(false);
      }
    };
    loadFollowUps();
  }, []);

  return (
    <div className="followup-container">
      <div className="section-header">
        <div className="title">
          <FiClock size={22} style={{ marginRight: 8 }} />
          Follow Up
        </div>
        <div className="subtitle">Review and trigger follow-up sending for ongoing campaigns</div>
      </div>

      {loading && <div className="loading">Loading follow-ups...</div>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <div className="list">
          {campaigns.length === 0 && (
            <div className="empty">No follow-up campaigns found</div>
          )}

          {Array.isArray(campaigns) && campaigns.map((c) => (
            <div key={`${c.campaignId}-${c.senderEmail || c.sender}`} className="item">
              <div className="left">
                <div className="name">{c.campaignName || c.name}</div>
                <div className="meta">
                  <span>Sender: {c.senderEmail || c.sender}</span>
                  <span>Sent: {c.sentCount || c.sent || 0}</span>
                  <span>Opens: {c.openCount || c.opens || 0}</span>
                  <span>Replies: {c.replyCount || c.replies || 0}</span>
                </div>
              </div>
              <div className="right">
                <button className="btn">
                  <FiRefreshCw style={{ marginRight: 6 }} /> Trigger Follow Up
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FollowUpTab;


