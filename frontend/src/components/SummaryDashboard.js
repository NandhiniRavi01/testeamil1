
import React, { useState, useEffect } from 'react';
import {
  FiMail, FiBarChart2, FiActivity, FiCheckCircle,
  FiAlertCircle, FiTrendingUp, FiTrendingDown, FiClock,
  FiUser, FiMessageSquare, FiRefreshCw, FiArrowRight,
  FiAward, FiTarget, FiPieChart, FiGrid, FiSend, FiFilter
} from 'react-icons/fi';
import './SummaryDashboard.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

import DailyEmailChart from './DailyEmailChart';
import PageHeader from './PageHeader';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://emailagent.cubegtp.com/';

const makeAuthenticatedRequest = async (url, options = {}) => {
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    if (response.status === 401) {
      window.location.href = '/';
      throw new Error('Authentication required');
    }
    return response;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
};

const SummaryDashboard = () => {
  const [stats, setStats] = useState({
    total_campaigns: 0,
    total_emails_sent: 0,
    total_replied: 0,
    total_bounced: 0,
    total_auto_reply: 0,
    total_no_reply: 0,
    total_sent_status: 0,
    active_campaigns: 0,
    success_rate: 0,
    bounce_rate: 0
  });

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentTracking, setRecentTracking] = useState([]);
  const [senderFilter, setSenderFilter] = useState('all');
  const [senderAccounts, setSenderAccounts] = useState([]);
  const [activityFilter, setActivityFilter] = useState('all');
  const [lastSynced, setLastSynced] = useState(new Date().toLocaleTimeString());

  const [perUserStats, setPerUserStats] = useState([]);
  const [perMonthStats, setPerMonthStats] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [histogramData, setHistogramData] = useState([]);
  const [histDateFilter, setHistDateFilter] = useState('7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [histStatusFilter, setHistStatusFilter] = useState('all');
  const [periodStats, setPeriodStats] = useState(null);

  useEffect(() => {
    fetchSenderAccounts();
  }, []);

  useEffect(() => {
    fetchDashboardData(senderFilter);
    fetchHistogramData();
  }, [senderFilter, histDateFilter, customStartDate, customEndDate, selectedMonth]);

  // When the selected month changes, show cached month stats if available
  useEffect(() => {
    if (perMonthStats[selectedMonth]) {
      setPerUserStats(perMonthStats[selectedMonth]);
    }
  }, [selectedMonth, perMonthStats]);

  const fetchSenderAccounts = async () => {
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/auto-reply/senders`);
      const result = await res.json();
      if (result && result.sender_accounts) {
        setSenderAccounts(result.sender_accounts);
      }
    } catch (error) {
      console.error("Error fetching sender accounts:", error);
    }
  };

  const fetchDashboardData = async (sender, isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      // Build query string
      const senderQuery = sender !== 'all' ? `?sender_email=${encodeURIComponent(sender)}` : '';

      // Fetch stats
      const statsRes = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/emails${senderQuery}`);
      const trackingData = await statsRes.json();

      const campaignsRes = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/campaigns${senderQuery}`);
      const campaignsData = await campaignsRes.json();

      const tracking = trackingData.tracking_data || [];
      const campaignList = campaignsData.campaigns || [];

      // Only count non-ready emails for live dashboard stats
      const liveTracking = tracking.filter(t => t.status !== 'ready');

      // Calculate aggregated stats
      const totalSent = liveTracking.length;
      const replied = liveTracking.filter(t => t.status === 'replied').length;
      const bounced = liveTracking.filter(t => t.status === 'bounced').length;
      const autoReply = liveTracking.filter(t => t.status === 'auto_reply' || t.status === 'auto-reply').length;
      const noReply = liveTracking.filter(t => t.status === 'no_reply' || t.status === 'no-reply').length;
      const sentStatus = liveTracking.filter(t => ['sent', 'delivered'].includes(t.status)).length;

      const successRate = totalSent > 0 ? ((replied / totalSent) * 100).toFixed(1) : 0;
      const bounceRate = totalSent > 0 ? ((bounced / totalSent) * 100).toFixed(1) : 0;

      setStats({
        total_campaigns: campaignList.length,
        total_emails_sent: totalSent,
        total_replied: replied,
        total_bounced: bounced,
        total_auto_reply: autoReply,
        total_no_reply: noReply,
        total_sent_status: sentStatus,
        active_campaigns: campaignList.filter(c => c.status === 'running' || c.status === 'completed').length,
        success_rate: successRate,
        bounce_rate: bounceRate
      });

      setCampaigns(campaignList.slice(0, 5));
      setRecentTracking(tracking.slice(0, 5));
      setLastSynced(new Date().toLocaleTimeString());

      // Aggregate per-user (sender) statistics by month and cache per-month stats
      try {
        const monthAggs = {};
        (tracking || []).forEach(t => {
          const dateStr = t.sent_time || t.updated_at || t.created_at || t.sent_time;
          const d = dateStr ? new Date(dateStr) : new Date();
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (!monthAggs[monthKey]) monthAggs[monthKey] = {};

          const sender = t.sender_email || 'unknown';
          if (!monthAggs[monthKey][sender]) {
            monthAggs[monthKey][sender] = { sender_email: sender, sent: 0, replied: 0, bounced: 0, auto_reply: 0, no_reply: 0, pending: 0 };
          }

          const userStat = monthAggs[monthKey][sender];
          userStat.sent += 1;
          const st = (t.status || '').toString();
          if (st === 'replied') userStat.replied += 1;
          else if (st === 'bounced') userStat.bounced += 1;
          else if (st === 'auto_reply' || st === 'auto-reply') userStat.auto_reply += 1;
          else if (st === 'no_reply' || st === 'no-reply') userStat.no_reply += 1;
          else if (['sent', 'delivered', 'queued', 'ready'].includes(st)) userStat.pending += 1;
        });

        // Merge monthAggs into cached perMonthStats (refresh per-month data when present)
        setPerMonthStats(prev => {
          const next = { ...prev };
          Object.keys(monthAggs).forEach(mk => {
            next[mk] = Object.values(monthAggs[mk]);
          });
          return next;
        });

        // Update visible per-user list for the selected month if available
        const sel = selectedMonth;
        if (monthAggs[sel]) {
          setPerUserStats(Object.values(monthAggs[sel]));
        } else if (perMonthStats[sel]) {
          setPerUserStats(perMonthStats[sel]);
        } else {
          // fallback: show aggregated across all tracked months
          const allUsers = {};
          Object.values(monthAggs).forEach(mobj => {
            Object.values(mobj).forEach(u => {
              if (!allUsers[u.sender_email]) allUsers[u.sender_email] = { ...u };
              else {
                const ex = allUsers[u.sender_email];
                ex.sent += u.sent; ex.replied += u.replied; ex.bounced += u.bounced; ex.auto_reply += u.auto_reply; ex.no_reply += u.no_reply; ex.pending += u.pending;
              }
            });
          });
          setPerUserStats(Object.values(allUsers));
        }
      } catch (e) {
        console.error('Error aggregating per-user stats', e);
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const fetchHistogramData = async (isSilent = false) => {
    try {
      const end = new Date();
      let start = new Date();

      if (histDateFilter === 'today') {
        start.setHours(0, 0, 0, 0);
      } else if (histDateFilter === 'yesterday') {
        start.setDate(end.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
      } else if (histDateFilter === '7days') {
        start.setDate(end.getDate() - 7);
      } else if (histDateFilter === '30days') {
        start.setDate(end.getDate() - 30);
      }

      let startStr, endStr;

      if (histDateFilter === 'custom' && customStartDate && customEndDate) {
        startStr = customStartDate;
        endStr = customEndDate;
      } else {
        const formatDate = (date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        startStr = formatDate(start);
        endStr = formatDate(end);
      }

      const senderQuery = senderFilter !== 'all' ? `&sender_email=${encodeURIComponent(senderFilter)}` : '';
      const query = `?from=${startStr}&to=${endStr}${senderQuery}`;

      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/dashboard/histogram${query}`);
      const data = await res.json();

      if (data && data.summary) {
        // Transform summary into categorical data for the BarChart (matching the requested image)
        const transformedData = [
          { name: 'Sent', count: data.summary.sent || 0, fill: '#3b82f6' },
          { name: 'Replied', count: data.summary.replied || 0, fill: '#10b981' },
          { name: 'Bounced', count: data.summary.bounced || 0, fill: '#ef4444' },
          { name: 'Auto-Reply', count: data.summary.auto_reply || 0, fill: '#8b5cf6' },
          { name: 'No Reply', count: data.summary.no_reply || 0, fill: '#94a3b8' }
        ];

        // Exclude 'queued' from histogram as requested
        setHistogramData(transformedData);

        const totalSent = data.summary.sent;
        setPeriodStats({
          success_rate: totalSent > 0 ? ((data.summary.replied / totalSent) * 100).toFixed(1) : 0,
          bounce_rate: totalSent > 0 ? ((data.summary.bounced / totalSent) * 100).toFixed(1) : 0,
          total_campaigns: data.summary.total_campaigns || stats.total_campaigns
        });
      }
    } catch (error) {
      console.error("Histogram stats fetch error", error);
    }
  };

  const filteredRecentTracking = activityFilter === 'all'
    ? recentTracking
    : recentTracking.filter(t => t.status === activityFilter);

  const StatCard = ({ title, value, icon: Icon, color, trend, trendValue }) => (
    <div className="stat-card">
      <div className="stat-card-header">
        <div className="stat-icon-container" style={{ backgroundColor: `${color}15`, color: color }}>
          <Icon size={24} />
        </div>
        {trend && (
          <div className={`stat-trend ${trend === 'up' ? 'trend-up' : 'trend-down'}`}>
            {trend === 'up' ? <FiTrendingUp size={16} /> : <FiTrendingDown size={16} />}
            <span>{trendValue}</span>
          </div>
        )}
      </div>
      <div className="stat-card-body">
        <h3 className="stat-value">{value}</h3>
        <p className="stat-label">{title}</p>
      </div>
      <div className="stat-card-footer">
        <div className="stat-progress-bg">
          <div className="stat-progress-bar" style={{ width: '70%', backgroundColor: color }}></div>
        </div>
      </div>
    </div>
  );

  if (loading && senderAccounts.length === 0) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Analyzing your email intelligence...</p>
      </div>
    );
  }

  return (
    <div className="summary-dashboard">
      <PageHeader 
        title="Performance Intelligence"
        subtitle={`Real-time analytics across ${senderFilter === 'all' ? 'all sender' : senderFilter} accounts • Auto-syncing active Last synced: ${lastSynced}`}
        icon={FiBarChart2}
      >
        <div className="global-slicer">
          <FiFilter className="slicer-icon" />
          <select
            value={senderFilter}
            onChange={(e) => setSenderFilter(e.target.value)}
            className="premium-select"
          >
            <option value="all">All Sales People</option>
            {senderAccounts.map(acc => (
              <option key={acc.email} value={acc.email}>{acc.sender_name || acc.email}</option>
            ))}
          </select>
        </div>
        <button className="refresh-btn" onClick={() => fetchDashboardData(senderFilter)}>
          <FiRefreshCw className={loading ? "spin" : ""} /> Refresh
        </button>
      </PageHeader>

      <div className="stats-grid">
        <StatCard
          title="Emails Dispatched"
          value={stats.total_emails_sent}
          icon={FiSend}
          color="#3b82f6"
          trend="up"
          trendValue="12%"
        />
        <StatCard
          title="Engagement Rate"
          value={`${stats.success_rate}%`}
          icon={FiTarget}
          color="#10b981"
          trend="up"
          trendValue="4.5%"
        />
        <StatCard
          title="Bounce Rate"
          value={`${stats.bounce_rate}%`}
          icon={FiAlertCircle}
          color="#ef4444"
          trend="down"
          trendValue="1.2%"
        />
        <StatCard
          title="Total Replies"
          value={stats.total_replied}
          icon={FiMessageSquare}
          color="#8b5cf6"
        />
      </div>

      <div className="dashboard-content">
        <div className="main-charts">
          <DailyEmailChart globalSender={senderFilter} />

          <div className="dashboard-card chart-card">
            <div className="card-header">
              <h3><FiActivity /> Delivery Overview</h3>
              <div className="card-actions">
                <FiGrid />
              </div>
            </div>
            <div className="delivery-stats">
              <div className="delivery-item">
                <div className="delivery-label">
                  <span>Replied</span>
                  <span>{stats.total_replied} ({stats.success_rate}%)</span>
                </div>
                <div className="delivery-bar-bg">
                  <div className="delivery-bar" style={{ width: `${stats.success_rate}%`, backgroundColor: '#10b981' }}></div>
                </div>
              </div>
              <div className="delivery-item">
                <div className="delivery-label">
                  <span>Bounced</span>
                  <span>{stats.total_bounced} ({stats.bounce_rate}%)</span>
                </div>
                <div className="delivery-bar-bg">
                  <div className="delivery-bar" style={{ width: `${stats.bounce_rate}%`, backgroundColor: '#ef4444' }}></div>
                </div>
              </div>
              <div className="delivery-item">
                <div className="delivery-label">
                  <span>Auto-Reply</span>
                  <span>{stats.total_auto_reply} ({stats.total_emails_sent > 0 ? ((stats.total_auto_reply / stats.total_emails_sent) * 100).toFixed(1) : 0}%)</span>
                </div>
                <div className="delivery-bar-bg">
                  <div className="delivery-bar" style={{ width: `${stats.total_emails_sent > 0 ? (stats.total_auto_reply / stats.total_emails_sent) * 100 : 0}%`, backgroundColor: '#8b5cf6' }}></div>
                </div>
              </div>
              <div className="delivery-item">
                <div className="delivery-label">
                  <span>No Reply Yet</span>
                  <span>{stats.total_no_reply} ({stats.total_emails_sent > 0 ? ((stats.total_no_reply / stats.total_emails_sent) * 100).toFixed(1) : 0}%)</span>
                </div>
                <div className="delivery-bar-bg">
                  <div className="delivery-bar" style={{ width: `${stats.total_emails_sent > 0 ? (stats.total_no_reply / stats.total_emails_sent) * 100 : 0}%`, backgroundColor: '#94a3b8' }}></div>
                </div>
              </div>
              <div className="delivery-item">
                <div className="delivery-label">
                  <span>Sent (Waiting)</span>
                  <span>{stats.total_sent_status} ({stats.total_emails_sent > 0 ? ((stats.total_sent_status / stats.total_emails_sent) * 100).toFixed(1) : 0}%)</span>
                </div>
                <div className="delivery-bar-bg">
                  <div className="delivery-bar" style={{ width: `${stats.total_emails_sent > 0 ? (stats.total_sent_status / stats.total_emails_sent) * 100 : 0}%`, backgroundColor: '#3b82f6' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Histogram Chart for Analysis */}
          <div className="dashboard-card chart-card">
            <div className="card-header chart-header">
              <div className="chart-title">
                <div className="chart-icon"><FiBarChart2 size={18} /></div>
                <div>
                  <h3>Email Performance Histogram</h3>
                  <p className="chart-subtitle">Distribution analysis of email campaign results</p>
                </div>
              </div>
              <div className="chart-actions">
                <select
                  className="mini-filter-select"
                  value={histDateFilter}
                  onChange={(e) => setHistDateFilter(e.target.value)}
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="7days">7 Days</option>
                  <option value="30days">30 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
            </div>

            {histDateFilter === 'custom' && (
              <div className="custom-range">
                <label className="date-field">
                  <span>From</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="input-field"
                  />
                </label>
                <label className="date-field">
                  <span>To</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="input-field"
                  />
                </label>
              </div>
            )}

            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={histogramData}
                  margin={{ top: 20, right: 30, left: 10, bottom: 0 }}
                  barSize={60}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                    dy={12}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    allowDecimals={false}
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.98)',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                      padding: '12px 16px'
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="center"
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '30px' }}
                    formatter={(value) => <span style={{ color: '#475569', fontWeight: 600, fontSize: '13px' }}>{value}</span>}
                  />
                  <Bar dataKey="count" name="count" animationDuration={1000} radius={[4, 4, 0, 0]}>
                    {histogramData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="period-metrics">
                <div className="period-metric accent-success">
                  <span className="metric-value">{periodStats ? periodStats.success_rate : stats.success_rate}%</span>
                  <span className="metric-label">Success Rate</span>
                </div>
                <div className="metric-divider" />
                <div className="period-metric accent-danger">
                  <span className="metric-value">{periodStats ? periodStats.bounce_rate : stats.bounce_rate}%</span>
                  <span className="metric-label">Bounce Rate</span>
                </div>
                <div className="metric-divider" />
                <div className="period-metric accent-primary">
                  <span className="metric-value">{periodStats ? periodStats.total_campaigns : stats.total_campaigns}</span>
                  <span className="metric-label">Total Campaigns</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="secondary-content">
          <div className="dashboard-card recent-activity">
            <div className="card-header">
              <h3><FiClock /> Recent Activity</h3>
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="mini-filter-select"
              >
                <option value="all">All</option>
                <option value="replied">Replies</option>
                <option value="bounced">Bounces</option>
                <option value="sent">Sent</option>
              </select>
            </div>
            <div className="activity-timeline">
              {filteredRecentTracking.length > 0 ? filteredRecentTracking.map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-icon" style={{
                    backgroundColor: activity.status === 'replied' ? '#10b981' :
                      activity.status === 'bounced' ? '#ef4444' : '#3b82f6'
                  }}>
                    {activity.status === 'replied' ? <FiMessageSquare size={14} /> :
                      activity.status === 'bounced' ? <FiAlertCircle size={14} /> : <FiMail size={14} />}
                  </div>
                  <div className="activity-details">
                    <p><strong>{activity.recipient_email}</strong> was marked as <span>{activity.status}</span></p>
                    <span className="activity-time">{new Date(activity.updated_at || activity.sent_time).toLocaleString()}</span>
                  </div>
                </div>
              )) : (
                <div className="empty-mini-state">No recent activity</div>
              )}
            </div>
          </div>

          {/* User Activity: per-sender metrics */}
          <div className="dashboard-card user-activity">
            <div className="card-header">
              <h3><FiUser /> User Activity</h3>
              <div className="card-actions">
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="mini-filter-select">
                  {(() => {
                    const keys = Object.keys(perMonthStats).length ? Object.keys(perMonthStats) : [selectedMonth];
                    return keys.sort((a,b)=>b.localeCompare(a)).map(mk => {
                      const d = new Date(mk + '-01');
                      const label = d.toLocaleString('default', { month: 'short', year: 'numeric' });
                      return <option key={mk} value={mk}>{label}</option>;
                    });
                  })()}
                </select>
              </div>
            </div>
            <div className="user-activity-list">
              {perUserStats && perUserStats.length > 0 ? (
                perUserStats.sort((a, b) => (b.sent || 0) - (a.sent || 0)).map(user => {
                  const account = senderAccounts.find(sa => sa.email === user.sender_email) || {};
                  let name = account.sender_name || user.sender_email || 'Unknown';
                  let emailDisplay = user.sender_email || '';
                  if (!user.sender_email || user.sender_email === 'unknown') {
                    name = 'Superadmin';
                    emailDisplay = 'Superadmin';
                  }
                  const successRate = user.sent > 0 ? ((user.replied / user.sent) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={user.sender_email} className="user-activity-item">
                      <div className="user-meta">
                        <div className="user-avatar">{(name || '').charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="user-name">{name}</div>
                          <div className="user-email">{emailDisplay}</div>
                        </div>
                      </div>
                      <div className="user-metrics">
                        <div className="user-metric">
                          <span className="metric-value primary">{user.sent}</span>
                          <span className="metric-label">Sent</span>
                        </div>
                        <div className="user-metric">
                          <span className="metric-value success">{user.replied}</span>
                          <span className="metric-label">Replies</span>
                        </div>
                        <div className="user-metric">
                          <span className="metric-value danger">{user.bounced}</span>
                          <span className="metric-label">Bounces</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-mini-state">No user activity available</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div >
  );
};

export default SummaryDashboard;


