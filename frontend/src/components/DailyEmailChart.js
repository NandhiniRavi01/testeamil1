import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { FiRefreshCw, FiTrendingUp, FiFilter } from 'react-icons/fi';
import './DailyEmailChart.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://emailagent.cubegtp.com';

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

const DailyEmailChart = ({ globalSender }) => {
    const [timeRange, setTimeRange] = useState(7);
    const [statusFilter, setStatusFilter] = useState('all');
    const [senderFilter, setSenderFilter] = useState('all');
    const [senderAccounts, setSenderAccounts] = useState([]);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ total: 0, engagement: '0%' });

    useEffect(() => {
        if (!globalSender) {
            fetchSenderAccounts();
        }
    }, [globalSender]);

    const activeSender = globalSender || senderFilter;

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

    const fetchHistoricalStats = async (days, sender) => {
        setLoading(true);
        try {
            let url = `${API_BASE_URL}/tracking/historical-stats?days=${days}`;
            if (sender !== 'all') {
                url += `&sender_email=${encodeURIComponent(sender)}`;
            }
            const res = await makeAuthenticatedRequest(url);
            const result = await res.json();

            if (result && Array.isArray(result)) {
                setData(result);

                // Calculate engagement for today (last item in array)
                const today = result[result.length - 1];
                const total = today ? (today.sent || 0) : 0;
                const engagement = total > 0 ? Math.round((today.replied / total) * 100) : 0;
                setStats({ total, engagement: `${engagement}%` });
            } else {
                setData([]);
            }
        } catch (error) {
            console.error("Error fetching historical stats:", error);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistoricalStats(timeRange, activeSender);

        // Set up real-time polling every 30 seconds
        const interval = setInterval(() => {
            fetchHistoricalStats(timeRange, activeSender);
        }, 30000);

        return () => clearInterval(interval);
    }, [timeRange, activeSender]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="custom-tooltip-premium">
                    <p className="tooltip-date">{label}</p>
                    {payload.map((entry, index) => (
                        <p key={index} className="tooltip-value" style={{ color: entry.color }}>
                            {entry.name}: <strong>{entry.value}</strong>
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    const statusOptions = [
        { value: 'all', label: 'All Statuses', color: '#3b82f6' },
        { value: 'sent', label: 'Sent', color: '#3b82f6' },
        { value: 'delivered', label: 'Delivered', color: '#10b981' },
        { value: 'replied', label: 'Replied', color: '#8b5cf6' },
        { value: 'bounced', label: 'Bounced', color: '#f43f5e' }
    ];

    const getChartLines = () => {
        if (statusFilter === 'all') {
            return [
                <Line type="monotone" dataKey="sent" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Sent" animationDuration={2000} key="sent" />,
                <Line type="monotone" dataKey="delivered" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Delivered" animationDuration={2000} key="delivered" />,
                <Line type="monotone" dataKey="replied" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Replied" animationDuration={2000} key="replied" />,
                <Line type="monotone" dataKey="bounced" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Bounced" animationDuration={2000} key="bounced" />
            ];
        } else {
            const selected = statusOptions.find(opt => opt.value === statusFilter);
            return (
                <Line
                    type="monotone"
                    dataKey={statusFilter}
                    stroke={selected.color}
                    strokeWidth={4}
                    dot={{ r: 5 }}
                    activeDot={{ r: 8 }}
                    name={selected.label}
                    animationDuration={2000}
                    key={statusFilter}
                />
            );
        }
    };

    return (
        <div className="dashboard-card chart-card analytics-card">
            <div className="card-header">
                <div className="header-title">
                    <h3 style={{ whiteSpace: 'nowrap' }}><FiTrendingUp style={{ color: '#3b82f6' }} /> Delivery Trend Analysis</h3>
                    <p className="subtitle">
                        Performance tracking over the last {timeRange} days<br/>
                        <span style={{ color: '#10b981', marginLeft: '0px', fontSize: '0.85rem' }}>● Auto-syncing</span>
                    </p>
                </div>
                <div className="card-actions-premium">
                    {!globalSender && (
                        <div className="filter-group">
                            <FiFilter className="filter-icon" />
                            <select
                                value={senderFilter}
                                onChange={(e) => setSenderFilter(e.target.value)}
                                className="status-select-premium"
                            >
                                <option value="all">All Senders</option>
                                {senderAccounts.map(acc => (
                                    <option key={acc.email} value={acc.email}>{acc.sender_name || acc.email}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="filter-group">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="status-select-premium"
                        >
                            {statusOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(Number(e.target.value))}
                        className="range-select-premium"
                    >
                        <option value={7}>7D</option>
                        <option value={14}>14D</option>
                        <option value={30}>30D</option>
                    </select>
                    <button className="refresh-btn-premium" onClick={() => fetchHistoricalStats(timeRange, activeSender)} disabled={loading}>
                        <FiRefreshCw className={loading ? "spin" : ""} />
                    </button>
                </div>
            </div>

            <div className="chart-wrapper">
                {loading && <div className="chart-loader"><div className="spinner"></div></div>}

                <ResponsiveContainer width="100%" height={320}>
                    <LineChart
                        data={data}
                        margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                            dataKey="display_date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                            allowDecimals={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            verticalAlign="top"
                            height={36}
                            iconType="circle"
                            wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 500 }}
                        />
                        {getChartLines()}
                        <ReferenceLine y={0} stroke="#e2e8f0" />
                    </LineChart>
                </ResponsiveContainer>

                {!loading && data.length === 0 && (
                    <div className="chart-empty-overlay">
                        <p>No activity recorded in this period</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DailyEmailChart;


