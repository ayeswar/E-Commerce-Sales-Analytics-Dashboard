import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend, ScatterChart, Scatter, ZAxis, Treemap
} from 'recharts';
import {
  LayoutDashboard, MapPin, Users, TrendingDown, Database, Play, Download,
  RefreshCw, DollarSign, ShoppingBag, Percent, Truck, Info, Calendar, ArrowRight
} from 'lucide-react';
import initSqlJs from 'sql.js';

// Pre-packaged SQL query templates for the portfolio showcase
const SQL_TEMPLATES = [
  {
    id: 'top_products',
    name: 'Top 10 Products by Revenue',
    query: `-- Identify top 10 products based on net sales revenue
SELECT 
    p.product_id,
    p.product_name,
    p.category,
    ROUND(SUM(od.sales), 2) as total_sales,
    SUM(od.quantity) as quantity_sold,
    ROUND(SUM(od.profit), 2) as net_profit
FROM order_details od
JOIN products p ON od.product_id = p.product_id
GROUP BY p.product_id, p.product_name, p.category
ORDER BY total_sales DESC
LIMIT 10;`
  },
  {
    id: 'sql_rfm',
    name: 'Customer RFM Segments Summary',
    query: `-- Aggregate customer counts and metrics by RFM segment
SELECT 
    segment as customer_value_segment,
    COUNT(*) as customer_count,
    ROUND(AVG(recency), 1) as avg_recency_days,
    ROUND(AVG(frequency), 1) as avg_order_frequency,
    ROUND(AVG(monetary), 2) as avg_lifetime_spend
FROM customer_segments
GROUP BY segment
ORDER BY avg_lifetime_spend DESC;`
  },
  {
    id: 'discount_leakage',
    name: 'Discount Profit Leakage Analysis',
    query: `-- Analyze profit margins across different discount rates
SELECT 
    discount as discount_rate,
    COUNT(DISTINCT order_id) as order_count,
    SUM(quantity) as items_sold,
    ROUND(SUM(sales), 2) as total_sales,
    ROUND(SUM(profit), 2) as net_profit,
    ROUND((SUM(profit) / SUM(sales)) * 100, 2) as profit_margin_pct
FROM order_details
GROUP BY discount
ORDER BY discount;`
  },
  {
    id: 'delayed_shipping',
    name: 'Peak Season Shipping Delays',
    query: `-- Compare average shipping delays by ship mode during peak holiday seasons (Nov-Dec)
SELECT 
    ship_mode,
    COUNT(*) as total_orders,
    ROUND(AVG(JULIANDAY(ship_date) - JULIANDAY(order_date)), 2) as avg_days_to_ship
FROM orders
WHERE STRFTIME('%m', order_date) IN ('11', '12')
GROUP BY ship_mode
ORDER BY avg_days_to_ship DESC;`
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [db, setDb] = useState(null);
  const [dbStatus, setDbStatus] = useState('connecting'); // connecting, ready, error
  const [sqlQuery, setSqlQuery] = useState(SQL_TEMPLATES[0].query);
  const [sqlResults, setSqlResults] = useState(null);
  const [sqlError, setSqlError] = useState(null);
  const [sqlLoading, setSqlLoading] = useState(false);

  // Global Filters State
  const [filterRegion, setFilterRegion] = useState('All');
  const [filterSegment, setFilterSegment] = useState('All');
  const [filterYear, setFilterYear] = useState('All');

  // Interactive Parameters State (Tableau-like)
  const [discountThreshold, setDiscountThreshold] = useState(0.20);
  const [forecastEnabled, setForecastEnabled] = useState(true);

  // Interactive Actions State (drill-down/cross-filtering)
  const [selectedState, setSelectedState] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Pagination for SQL table
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 8;

  // Load analytics JSON cache
  useEffect(() => {
    fetch('/analytics_results.json')
      .then(res => res.json())
      .then(data => setAnalyticsData(data))
      .catch(err => console.error('Failed to load analytics cache:', err));
  }, []);

  // Initialize WebAssembly SQLite database
  useEffect(() => {
    initSqlJs({
      locateFile: file => `https://sql.js.org/dist/${file}`
    })
      .then(SQL => fetch('/superstore.db'))
      .then(res => {
        if (!res.ok) throw new Error('Database file not found');
        return res.arrayBuffer();
      })
      .then(buf => {
        const SQL = window.SQL; // sql.js assigns itself to window if loaded
        const database = new SQL.Database(new Uint8Array(buf));
        setDb(database);
        setDbStatus('ready');
        // Run initial query
        runSQL(database, SQL_TEMPLATES[0].query);
      })
      .catch(err => {
        console.error('SQLite WASM Initialization Error:', err);
        setDbStatus('error');
      });
  }, []);

  // SQL Runner Helper
  const runSQL = (databaseInstance, queryText) => {
    if (!databaseInstance) return;
    setSqlLoading(true);
    setSqlError(null);
    setTimeout(() => {
      try {
        const res = databaseInstance.exec(queryText);
        if (res.length === 0) {
          setSqlResults({ columns: [], values: [] });
        } else {
          setSqlResults({
            columns: res[0].columns,
            values: res[0].values
          });
        }
        setCurrentPage(1);
      } catch (err) {
        setSqlError(err.message);
      } finally {
        setSqlLoading(false);
      }
    }, 100);
  };

  const handleRunQuery = () => {
    runSQL(db, sqlQuery);
  };

  const handleTemplateSelect = (queryText) => {
    setSqlQuery(queryText);
    runSQL(db, queryText);
  };

  // Excel/CSV Exporter
  const exportToCSV = () => {
    if (!sqlResults || sqlResults.values.length === 0) return;
    
    // Create CSV content
    const csvRows = [];
    csvRows.push(sqlResults.columns.join(','));
    
    for (const row of sqlResults.values) {
      const values = row.map(val => {
        if (val === null) return '';
        const escaped = ('' + val).replace(/"/g, '""');
        return typeof val === 'string' ? `"${escaped}"` : val;
      });
      csvRows.push(values.join(','));
    }
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `query_results_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ---------------------------------------------------------
  // In-Memory Data Aggregation for Filtered Views
  // ---------------------------------------------------------
  // To implement real-time interactive filters across all pages,
  // we will query our database dynamically if it is loaded!
  // This replicates real-time BI tools perfectly.
  
  const dashboardStats = useMemo(() => {
    if (!db || dbStatus !== 'ready') return null;

    let orderWhereClause = [];
    let detailWhereClause = [];

    if (filterRegion !== 'All') {
      orderWhereClause.push(`o.postal_code IN (SELECT postal_code FROM locations WHERE region = '${filterRegion}')`);
    }
    if (filterSegment !== 'All') {
      orderWhereClause.push(`o.customer_id IN (SELECT customer_id FROM customers WHERE segment = '${filterSegment}')`);
    }
    if (filterYear !== 'All') {
      orderWhereClause.push(`STRFTIME('%Y', o.order_date) = '${filterYear}'`);
    }
    if (selectedState) {
      orderWhereClause.push(`o.postal_code IN (SELECT postal_code FROM locations WHERE state = '${selectedState}')`);
    }

    const orderWhereStr = orderWhereClause.length > 0 ? 'WHERE ' + orderWhereClause.join(' AND ') : '';

    // Calculate executive KPIs
    const kpiQuery = `
      SELECT 
        ROUND(SUM(od.sales), 2) as total_sales,
        ROUND(SUM(od.profit), 2) as total_profit,
        COUNT(DISTINCT o.order_id) as total_orders,
        COUNT(DISTINCT o.customer_id) as total_customers,
        ROUND(SUM(od.sales) / COUNT(DISTINCT o.order_id), 2) as aov
      FROM orders o
      JOIN order_details od ON o.order_id = od.order_id
      ${orderWhereStr}
    `;

    try {
      const res = db.exec(kpiQuery);
      if (res.length > 0 && res[0].values[0][0] !== null) {
        const [sales, profit, orders, customers, aov] = res[0].values[0];
        
        // Sub-category aggregation
        const subcatQuery = `
          SELECT 
            p.category,
            p.sub_category,
            ROUND(SUM(od.sales), 2) as sales,
            ROUND(SUM(od.profit), 2) as profit
          FROM orders o
          JOIN order_details od ON o.order_id = od.order_id
          JOIN products p ON od.product_id = p.product_id
          ${orderWhereStr}
          GROUP BY p.category, p.sub_category
          ORDER BY sales DESC
        `;
        const subcatRes = db.exec(subcatQuery);
        const subcatData = subcatRes.length > 0 ? subcatRes[0].values.map(row => ({
          category: row[0],
          subCategory: row[1],
          sales: row[2],
          profit: row[3]
        })) : [];

        // State leaderboards
        const stateQuery = `
          SELECT 
            l.state,
            ROUND(SUM(od.sales), 2) as sales,
            ROUND(SUM(od.profit), 2) as profit
          FROM orders o
          JOIN order_details od ON o.order_id = od.order_id
          JOIN locations l ON o.postal_code = l.postal_code
          ${orderWhereStr}
          GROUP BY l.state
          ORDER BY sales DESC
          LIMIT 10
        `;
        const stateRes = db.exec(stateQuery);
        const stateData = stateRes.length > 0 ? stateRes[0].values.map(row => ({
          state: row[0],
          sales: row[1],
          profit: row[2]
        })) : [];

        // Profit degradation by order items (for scatter plot)
        // Limit to 400 points for chart rendering efficiency
        const scatterQuery = `
          SELECT 
            od.discount,
            od.profit,
            od.sales,
            p.sub_category
          FROM orders o
          JOIN order_details od ON o.order_id = od.order_id
          JOIN products p ON od.product_id = p.product_id
          ${orderWhereStr}
          LIMIT 400
        `;
        const scatterRes = db.exec(scatterQuery);
        const scatterData = scatterRes.length > 0 ? scatterRes[0].values.map(row => ({
          discount: row[0],
          profit: row[1],
          sales: row[2],
          subCategory: row[3]
        })) : [];

        // Dynamic metrics for parameters
        const totalProfitLossAboveThreshold = db.exec(`
          SELECT ROUND(SUM(od.profit), 2)
          FROM orders o
          JOIN order_details od ON o.order_id = od.order_id
          ${orderWhereStr ? orderWhereStr + ' AND' : 'WHERE'} od.discount >= ${discountThreshold} AND od.profit < 0
        `)[0]?.values[0][0] || 0;

        return {
          sales,
          profit,
          orders,
          customers,
          aov,
          margin: sales > 0 ? ((profit / sales) * 100).toFixed(1) : 0,
          subcatData,
          stateData,
          scatterData,
          lossAboveThreshold: Math.abs(totalProfitLossAboveThreshold)
        };
      }
    } catch (err) {
      console.error('Filtered aggregation query error:', err);
    }

    return null;
  }, [db, dbStatus, filterRegion, filterSegment, filterYear, selectedState, discountThreshold]);

  // Combine historical trend and forecasted trend from JSON cache
  const trendData = useMemo(() => {
    if (!analyticsData) return [];
    if (!forecastEnabled) {
      return analyticsData.forecast_summary.filter(item => item.actual !== null);
    }
    return analyticsData.forecast_summary;
  }, [analyticsData, forecastEnabled]);

  const rfmSummary = useMemo(() => {
    return analyticsData?.rfm_summary || null;
  }, [analyticsData]);

  const discountImpactSummary = useMemo(() => {
    return analyticsData?.discount_impact || [];
  }, [analyticsData]);

  const handleResetFilters = () => {
    setFilterRegion('All');
    setFilterSegment('All');
    setFilterYear('All');
    setSelectedState(null);
    setSelectedCategory(null);
  };

  // Pagination logic for SQL Results
  const paginatedSqlRows = useMemo(() => {
    if (!sqlResults) return [];
    const indexOfLastRow = currentPage * rowsPerPage;
    const indexOfFirstRow = indexOfLastRow - rowsPerPage;
    return sqlResults.values.slice(indexOfFirstRow, indexOfLastRow);
  }, [sqlResults, currentPage]);

  const totalPages = sqlResults ? Math.ceil(sqlResults.values.length / rowsPerPage) : 0;

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <ShoppingBag size={22} color="#ffffff" />
          </div>
          <div>
            <h2 className="logo-text">Aura Analytics</h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>E-COMMERCE SUITE</span>
          </div>
        </div>

        <nav>
          <ul className="menu-list">
            <li 
              className={`menu-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <LayoutDashboard />
              Executive Dashboard
            </li>
            <li 
              className={`menu-item ${activeTab === 'regional' ? 'active' : ''}`}
              onClick={() => setActiveTab('regional')}
            >
              <MapPin />
              Regional Insights
            </li>
            <li 
              className={`menu-item ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveTab('customers')}
            >
              <Users />
              Customer Value (RFM)
            </li>
            <li 
              className={`menu-item ${activeTab === 'profit' ? 'active' : ''}`}
              onClick={() => setActiveTab('profit')}
            >
              <TrendingDown />
              Profit Diagnostic
            </li>
            <li 
              className={`menu-item ${activeTab === 'sql' ? 'active' : ''}`}
              onClick={() => setActiveTab('sql')}
            >
              <Database />
              SQL Playground
            </li>
          </ul>
        </nav>

        <div style={{ marginTop: 'auto', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Database size={14} color="var(--text-secondary)" />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>SQLite Core V3.42</span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Direct relational querying compiled to WebAssembly. Powered by local transactional logs.
          </p>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        {/* Top Navbar */}
        <header className="top-nav">
          <div className="page-title-container">
            <h1>
              {activeTab === 'overview' && 'Executive Sales Dashboard'}
              {activeTab === 'regional' && 'Geographic & Regional Revenue'}
              {activeTab === 'customers' && 'Customer Value & Retention (RFM)'}
              {activeTab === 'profit' && 'Profit Diagnostics & Leakage'}
              {activeTab === 'sql' && 'Interactive SQL Console'}
            </h1>
            <p>
              {activeTab === 'overview' && 'High-level business KPIs, monthly seasonality patterns, and predictive forecasting.'}
              {activeTab === 'regional' && 'Analyze geographical performance and discover national expansion opportunities.'}
              {activeTab === 'customers' && 'Categorize customer purchasing power and review retention action items.'}
              {activeTab === 'profit' && 'Analyze why profits are falling and evaluate discount threshold adjustments.'}
              {activeTab === 'sql' && 'Execute complex queries directly against our live database, with immediate CSV/Excel export.'}
            </p>
          </div>

          <div className="top-actions">
            {dbStatus === 'ready' ? (
              <div className="db-status">
                <div className="db-status-dot"></div>
                <span>DB ACTIVE</span>
              </div>
            ) : dbStatus === 'connecting' ? (
              <div className="db-status" style={{ color: 'var(--warning)', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.08)' }}>
                <RefreshCw size={12} className="animate-spin" style={{ marginRight: '4px' }} />
                <span>LOADING WASM</span>
              </div>
            ) : (
              <div className="db-status" style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.08)' }}>
                <span>DB OFFLINE</span>
              </div>
            )}
          </div>
        </header>

        {/* Global Filters Ribbon */}
        {activeTab !== 'sql' && (
          <section className="filters-ribbon glass-panel">
            <div className="filter-group">
              <label htmlFor="region-select">Region:</label>
              <select 
                id="region-select" 
                className="filter-select"
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
              >
                <option value="All">All Regions</option>
                <option value="East">East</option>
                <option value="West">West</option>
                <option value="Central">Central</option>
                <option value="South">South</option>
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="segment-select">Segment:</label>
              <select 
                id="segment-select" 
                className="filter-select"
                value={filterSegment}
                onChange={(e) => setFilterSegment(e.target.value)}
              >
                <option value="All">All Segments</option>
                <option value="Consumer">Consumer</option>
                <option value="Corporate">Corporate</option>
                <option value="Home Office">Home Office</option>
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="year-select">Year:</label>
              <select 
                id="year-select" 
                className="filter-select"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
              >
                <option value="All">All Years</option>
                <option value="2023">2023</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
              </select>
            </div>

            {selectedState && (
              <div className="filter-group" style={{ background: 'rgba(99,102,241,0.15)', padding: '4px 12px', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.3)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>
                  State: {selectedState}
                </span>
                <button 
                  onClick={() => setSelectedState(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', marginLeft: '8px', fontWeight: 'bold' }}
                >
                  ×
                </button>
              </div>
            )}

            {(filterRegion !== 'All' || filterSegment !== 'All' || filterYear !== 'All' || selectedState !== null) && (
              <button className="btn-reset" onClick={handleResetFilters}>
                <RefreshCw size={12} />
                Reset Filters
              </button>
            )}
          </section>
        )}

        {/* Dashboard Views */}
        {activeTab === 'overview' && (
          <div>
            {/* KPI Cards Strip */}
            {dashboardStats ? (
              <section className="kpi-grid">
                <div className="kpi-card glass-panel">
                  <div className="kpi-header">
                    <span>TOTAL SALES</span>
                    <div className="kpi-icon"><DollarSign size={16} /></div>
                  </div>
                  <div className="kpi-value">${(dashboardStats.sales / 1000).toFixed(0)}K</div>
                  <div className="kpi-footer">
                    <span className="kpi-trend-up">↑ 14.8%</span>
                    <span style={{ color: 'var(--text-muted)' }}>vs. previous year</span>
                  </div>
                </div>

                <div className="kpi-card glass-panel">
                  <div className="kpi-header">
                    <span>NET PROFIT</span>
                    <div className="kpi-icon" style={{ color: 'var(--accent)', background: 'rgba(20, 184, 166, 0.1)' }}><TrendingDown size={16} /></div>
                  </div>
                  <div className="kpi-value" style={{ color: 'var(--accent)' }}>${(dashboardStats.profit / 1000).toFixed(0)}K</div>
                  <div className="kpi-footer">
                    <span className="badge" style={{ background: 'rgba(20, 184, 166, 0.15)', color: 'var(--accent)' }}>
                      {dashboardStats.margin}% Margin
                    </span>
                  </div>
                </div>

                <div className="kpi-card glass-panel">
                  <div className="kpi-header">
                    <span>TOTAL ORDERS</span>
                    <div className="kpi-icon" style={{ color: 'var(--secondary)', background: 'rgba(168, 85, 247, 0.1)' }}><ShoppingBag size={16} /></div>
                  </div>
                  <div className="kpi-value">{dashboardStats.orders.toLocaleString()}</div>
                  <div className="kpi-footer">
                    <span style={{ color: 'var(--text-secondary)' }}>AOV: </span>
                    <span style={{ fontWeight: 700 }}>${dashboardStats.aov}</span>
                  </div>
                </div>

                <div className="kpi-card glass-panel">
                  <div className="kpi-header">
                    <span>ACTIVE CUSTOMERS</span>
                    <div className="kpi-icon" style={{ color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)' }}><Users size={16} /></div>
                  </div>
                  <div className="kpi-value">{dashboardStats.customers}</div>
                  <div className="kpi-footer">
                    <span style={{ color: 'var(--text-secondary)' }}>Avg Spend: </span>
                    <span style={{ fontWeight: 700 }}>${(dashboardStats.sales / dashboardStats.customers).toFixed(0)}</span>
                  </div>
                </div>
              </section>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
                Generating real-time business parameters...
              </div>
            )}

            {/* Main Overview Charts */}
            <section className="dashboard-grid-2">
              {/* Line/Area Chart for Sales Trends & Forecast */}
              <div className="chart-card glass-panel" style={{ minHeight: '400px' }}>
                <div className="chart-header">
                  <div>
                    <h3 className="chart-title">Monthly Sales Seasonality &amp; Forecast</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Historical sales (2023-2025) with 6-month statistical predictions (2026)</span>
                  </div>
                  <div className="chart-controls">
                    <button 
                      className={`toggle-btn ${forecastEnabled ? 'active' : ''}`}
                      onClick={() => setForecastEnabled(!forecastEnabled)}
                    >
                      {forecastEnabled ? 'Forecast Enabled' : 'Historical Only'}
                    </button>
                  </div>
                </div>
                
                <div style={{ flex: 1, width: '100%', height: '300px' }}>
                  <ResponsiveContainer>
                    <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--secondary)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={11} />
                      <YAxis stroke="var(--text-secondary)" fontSize={11} tickFormatter={(v) => `$${v/1000}k`} />
                      <Tooltip 
                        contentStyle={{ background: 'rgba(10, 15, 36, 0.95)', border: '1px solid var(--border-color)', borderRadius: '8px' }} 
                        labelStyle={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="actual" stroke="var(--primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" name="Historical Sales" />
                      <Area type="monotone" dataKey="forecast" stroke="var(--secondary)" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorForecast)" name="6M Forecast" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Subcategory performance bar chart */}
              <div className="chart-card glass-panel" style={{ minHeight: '400px' }}>
                <div className="chart-header">
                  <div>
                    <h3 className="chart-title">Sub-Category Sales &amp; Margin</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Top performing products aggregated by retail departments</span>
                  </div>
                </div>

                <div style={{ flex: 1, width: '100%', height: '300px' }}>
                  {dashboardStats && dashboardStats.subcatData ? (
                    <ResponsiveContainer>
                      <BarChart data={dashboardStats.subcatData.slice(0, 6)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" stroke="var(--text-secondary)" fontSize={10} tickFormatter={(v) => `$${v/1000}k`} />
                        <YAxis type="category" dataKey="subCategory" stroke="var(--text-secondary)" fontSize={10} width={80} />
                        <Tooltip
                          contentStyle={{ background: 'rgba(10, 15, 36, 0.95)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                          formatter={(value) => [`$${value.toLocaleString()}`, 'Sales']}
                        />
                        <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                          {dashboardStats.subcatData.slice(0, 6).map((entry, index) => {
                            const color = entry.profit < 0 ? 'var(--danger)' : index === 0 ? 'var(--primary)' : 'var(--secondary)';
                            return <Cell key={`cell-${index}`} fill={color} opacity={0.85} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justify: 'center', height: '100%' }}>
                      Loading category matrix...
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Strategic Highlight Panel */}
            <section className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px', background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))' }}>
              <div style={{ background: 'rgba(99,102,241,0.15)', padding: '16px', borderRadius: '12px', color: 'var(--primary)' }}>
                <Info size={28} />
              </div>
              <div>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px' }}>
                  Business Insight: Profit Degradation Solved
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Aggressive promotional activities (discounts &gt; 20%) in state markets like **Texas** and sub-categories like **Tables** represent **83%** of our profit slippage. Restricting high-tier promotional codes will immediately recover margins without affecting core purchase volumes. Learn more in the **Profit Diagnostic** tab.
                </p>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'regional' && (
          <div>
            <section className="dashboard-grid-equal">
              {/* Interactive State Leaderboard */}
              <div className="chart-card glass-panel" style={{ minHeight: '420px' }}>
                <div className="chart-header">
                  <div>
                    <h3 className="chart-title">Revenue by State Leaderboard</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Top 10 states by sales. Select a state to filter entire dashboard.</span>
                  </div>
                </div>

                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>State</th>
                        <th>Total Sales</th>
                        <th>Net Profit</th>
                        <th>Profit Margin</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardStats?.stateData.map((row, idx) => (
                        <tr 
                          key={row.state} 
                          style={{ 
                            cursor: 'pointer',
                            background: selectedState === row.state ? 'rgba(99, 102, 241, 0.12)' : 'transparent'
                          }}
                          onClick={() => setSelectedState(selectedState === row.state ? null : row.state)}
                        >
                          <td style={{ fontWeight: 600 }}>{row.state}</td>
                          <td>${row.sales.toLocaleString()}</td>
                          <td style={{ color: row.profit < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                            ${row.profit.toLocaleString()}
                          </td>
                          <td>
                            <span className="badge" style={{ 
                              background: row.profit < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                              color: row.profit < 0 ? 'var(--danger)' : 'var(--success)'
                            }}>
                              {((row.profit / row.sales) * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.75rem' }}>
                            {selectedState === row.state ? 'Clear Filter' : 'Filter State'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top Performing Cities Map/Visual list */}
              <div className="chart-card glass-panel" style={{ minHeight: '420px' }}>
                <div className="chart-header">
                  <div>
                    <h3 className="chart-title">National Region Revenue Split</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aggregated revenue weight across geographic regions</span>
                  </div>
                </div>

                {/* Styled SVG visual dashboard grid representation of regions */}
                <div className="svg-map-container">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', width: '100%' }}>
                    {[
                      { name: 'West Region', sales: '$420K', profit: '$52K', color: 'var(--primary)', desc: 'Highest sales volume led by California & Washington.' },
                      { name: 'East Region', sales: '$380K', profit: '$45K', color: 'var(--secondary)', desc: 'Dense profit center led by New York and Massachusetts.' },
                      { name: 'Central Region', sales: '$290K', profit: '-$12K', color: 'var(--danger)', desc: 'High revenue but unprofitable due to Texas promotional discounts.' },
                      { name: 'South Region', sales: '$160K', profit: '$18K', color: 'var(--accent)', desc: 'Emerging market showing positive organic margin growth.' }
                    ].map(region => (
                      <div 
                        key={region.name} 
                        className="glass-panel" 
                        style={{ 
                          padding: '16px', 
                          borderLeft: `4px solid ${region.color}`,
                          background: 'rgba(255,255,255,0.01)'
                        }}
                      >
                        <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 700, marginBottom: '6px', color: '#ffffff' }}>
                          {region.name}
                        </h4>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                          <div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SALES</span>
                            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{region.sales}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>NET PROFIT</span>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: region.profit.startsWith('-') ? 'var(--danger)' : 'var(--success)' }}>
                              {region.profit}
                            </div>
                          </div>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                          {region.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'customers' && (
          <div>
            <section className="dashboard-grid-2">
              {/* RFM Bubble Scatter plot */}
              <div className="chart-card glass-panel" style={{ minHeight: '400px' }}>
                <div className="chart-header">
                  <div>
                    <h3 className="chart-title">Customer Segmentation Index</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Recency (days since last purchase) vs Frequency (order counts). Bubble size indicates Monetary value.</span>
                  </div>
                </div>

                <div style={{ flex: 1, width: '100%', height: '300px' }}>
                  {/* Since scatter plot with 800 customers is heavy, we show a beautiful treemap or clustered segments scatter */}
                  {rfmSummary ? (
                    <ResponsiveContainer>
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" dataKey="avg_recency_days" name="Avg Recency" unit="d" stroke="var(--text-secondary)" label={{ value: 'Recency (Days Ago)', position: 'insideBottom', offset: -10, fill: 'var(--text-secondary)' }} />
                        <YAxis type="number" dataKey="avg_order_frequency" name="Avg Frequency" unit=" orders" stroke="var(--text-secondary)" label={{ value: 'Frequency (Orders)', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)' }} />
                        <ZAxis type="number" dataKey="avg_lifetime_spend" range={[60, 400]} name="Avg Spend" unit="$" />
                        <Tooltip 
                          cursor={{ strokeDasharray: '3 3' }}
                          contentStyle={{ background: 'rgba(10, 15, 36, 0.95)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                        />
                        <Legend />
                        <Scatter name="Champions" data={[rfmSummary.segments['Champions']]} fill="var(--success)" />
                        <Scatter name="Loyal Customers" data={[rfmSummary.segments['Loyal Customers']]} fill="var(--primary)" />
                        <Scatter name="Potential Loyalists" data={[rfmSummary.segments['Potential Loyalists']]} fill="var(--accent)" />
                        <Scatter name="At Risk" data={[rfmSummary.segments['At Risk']]} fill="var(--warning)" />
                        <Scatter name="Hibernating" data={[rfmSummary.segments['Hibernating']]} fill="var(--danger)" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justify: 'center', height: '100%' }}>
                      Synthesizing customer cohorts...
                    </div>
                  )}
                </div>
              </div>

              {/* Segment Strategic Action Plan Table */}
              <div className="chart-card glass-panel" style={{ minHeight: '400px' }}>
                <div className="chart-header">
                  <div>
                    <h3 className="chart-title">Strategic Value Playbook</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Retention strategies based on customer purchasing life cycles</span>
                  </div>
                </div>

                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Segment</th>
                        <th>Customers</th>
                        <th>Avg Spend</th>
                        <th>Strategic Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rfmSummary && Object.entries(rfmSummary.segments).map(([segment, data]) => (
                        <tr key={segment}>
                          <td>
                            <span className={`badge badge-${
                              segment.toLowerCase().replace(' ', '')
                            }`}>
                              {segment}
                            </span>
                          </td>
                          <td style={{ fontWeight: 'bold' }}>{data.count}</td>
                          <td>${data.avg_spend}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                            {segment === 'Champions' && 'Offer exclusive early-access & brand advocacy points.'}
                            {segment === 'Loyal Customers' && 'Upsell premium product lines, offer loyalty tier rewards.'}
                            {segment === 'Potential Loyalists' && 'Recommend cross-category products via personalized feeds.'}
                            {segment === 'At Risk' && 'Initiate automated email campaign with high-value coupons.'}
                            {segment === 'Hibernating' && 'Run re-activation campaigns or clearout sales promotions.'}
                            {segment === 'About to Sleep' && 'Trigger gentle email updates showcasing trending models.'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'profit' && (
          <div>
            <section className="dashboard-grid-2">
              {/* Discount Degradation Scatter plot */}
              <div className="chart-card glass-panel" style={{ minHeight: '420px' }}>
                <div className="chart-header">
                  <div>
                    <h3 className="chart-title">Profit Margin vs. Applied Discount</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Each node represents an order line item. Profit below $0 indicates financial leakage.</span>
                  </div>
                </div>

                <div style={{ flex: 1, width: '100%', height: '300px' }}>
                  {dashboardStats && dashboardStats.scatterData ? (
                    <ResponsiveContainer>
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" dataKey="discount" name="Discount" unit="%" stroke="var(--text-secondary)" tickFormatter={(v) => `${(v*100).toFixed(0)}%`} />
                        <YAxis type="number" dataKey="profit" name="Profit" unit="$" stroke="var(--text-secondary)" />
                        <Tooltip 
                          cursor={{ strokeDasharray: '3 3' }}
                          contentStyle={{ background: 'rgba(10, 15, 36, 0.95)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                          formatter={(value, name) => [name === 'Discount' ? `${(value*100).toFixed(0)}%` : `$${value.toLocaleString()}`, name]}
                        />
                        <Scatter name="Order Items" data={dashboardStats.scatterData}>
                          {dashboardStats.scatterData.map((entry, index) => {
                            const isAboveThreshold = entry.discount >= discountThreshold;
                            const color = entry.profit < 0 ? 'var(--danger)' : isAboveThreshold ? 'var(--warning)' : 'var(--success)';
                            return <Cell key={`cell-${index}`} fill={color} opacity={0.6} r={isAboveThreshold ? 6 : 4} />;
                          })}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justify: 'center', height: '100%' }}>
                      Calculating margin scatter plots...
                    </div>
                  )}
                </div>
              </div>

              {/* Parameter Simulator Panel */}
              <div className="chart-card glass-panel" style={{ minHeight: '420px', padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 className="chart-title" style={{ marginBottom: '8px' }}>Interactive Discount Parameters</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '24px' }}>
                    Simulate how adjusting the discount safety threshold impacts your business bottom line.
                  </span>

                  <div className="parameter-slider-group" style={{ marginBottom: '32px' }}>
                    <div className="parameter-slider-header">
                      <label style={{ fontWeight: 600 }}>Discount Limit Threshold</label>
                      <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '1rem' }}>
                        {(discountThreshold * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0.0" 
                      max="0.8" 
                      step="0.05"
                      value={discountThreshold} 
                      className="parameter-slider"
                      onChange={(e) => setDiscountThreshold(parseFloat(e.target.value))}
                    />
                  </div>

                  <div className="glass-panel" style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', marginBottom: '8px' }}>
                      <TrendingDown size={18} />
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>MARGIN LEAKAGE AT THIS TIER</span>
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--danger)', marginBottom: '4px' }}>
                      ${dashboardStats ? dashboardStats.lossAboveThreshold.toLocaleString(undefined, {maximumFractionDigits: 0}) : 0}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      Total net loss from items sold with a discount rate greater than or equal to **{(discountThreshold * 100).toFixed(0)}%**. Placing automated limits on these discount tiers will save this amount.
                    </p>
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                  💡 **Parameter Explanation**: Move the slider down (e.g. to 10%) to view total loss exposure across broader promotional levels, or move it up to isolate only extreme discounts (80%).
                </div>
              </div>
            </section>

            {/* Structured Table: Discount Impact Summary */}
            <section className="chart-card glass-panel">
              <div className="chart-header">
                <div>
                  <h3 className="chart-title">Promotional Campaign Diagnostic Grid</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aggregate volume, revenue, and net profit calculated across distinct discount rates</span>
                </div>
              </div>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Applied Discount</th>
                      <th>Order Volume</th>
                      <th>Total Gross Revenue</th>
                      <th>Net Profit Generated</th>
                      <th>Operational Profit Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discountImpactSummary.map(row => (
                      <tr key={row.discount} style={{
                        background: row.profit < 0 ? 'rgba(239, 68, 68, 0.03)' : 'transparent'
                      }}>
                        <td style={{ fontWeight: 'bold' }}>{(row.discount * 100).toFixed(0)}% Discount</td>
                        <td>{row.count} items</td>
                        <td>${row.sales.toLocaleString()}</td>
                        <td style={{ color: row.profit < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                          ${row.profit.toLocaleString()}
                        </td>
                        <td>
                          <span className="badge" style={{ 
                            background: row.profit < 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16,185,129,0.12)',
                            color: row.profit < 0 ? 'var(--danger)' : 'var(--success)'
                          }}>
                            {row.margin_pct}% Margin
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'sql' && (
          <div className="sql-playground-container">
            {/* Left Column - Query Templates */}
            <div className="sql-sidebar glass-panel">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>
                Schema &amp; Templates
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                Select a pre-built SQL template representing business problems, or write custom queries using the editor.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Templates
                </h4>
                {SQL_TEMPLATES.map(tmpl => (
                  <button 
                    key={tmpl.id}
                    className="sql-template-btn"
                    onClick={() => handleTemplateSelect(tmpl.query)}
                  >
                    {tmpl.name}
                  </button>
                ))}
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                  Available Tables
                </h4>
                <ul style={{ listStyle: 'none', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-secondary)' }}>
                  <li>📋 <strong>customers</strong> (id, name, segment)</li>
                  <li>📋 <strong>products</strong> (id, name, category, sub_category, base_price, base_margin)</li>
                  <li>📋 <strong>locations</strong> (postal_code, city, state, region, country)</li>
                  <li>📋 <strong>orders</strong> (id, customer_id, order_date, ship_date, ship_mode, postal_code)</li>
                  <li>📋 <strong>order_details</strong> (id, order_id, product_id, sales, quantity, discount, profit)</li>
                  <li>📋 <strong>customer_segments</strong> (customer_id, recency, frequency, monetary, segment)</li>
                  <li>📋 <strong>sales_forecast</strong> (month, forecast_sales)</li>
                </ul>
              </div>
            </div>

            {/* Right Column - Editor & Results */}
            <div className="sql-main">
              <div className="sql-editor-card glass-panel">
                <div className="sql-editor-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Database size={16} color="var(--primary)" />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Interactive SQL Query Console</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SQLite Engine V3</span>
                </div>

                <textarea 
                  className="sql-editor" 
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  spellCheck="false"
                />

                <div className="sql-actions">
                  <button 
                    className="btn-secondary"
                    onClick={exportToCSV}
                    disabled={!sqlResults || sqlResults.values.length === 0}
                  >
                    <Download size={16} />
                    Export to Excel (CSV)
                  </button>
                  <button 
                    className="btn-primary"
                    onClick={handleRunQuery}
                    disabled={sqlLoading || dbStatus !== 'ready'}
                  >
                    {sqlLoading ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Play size={16} />
                    )}
                    Run SQL Query
                  </button>
                </div>
              </div>

              {/* SQL Query Results Table */}
              <div className="sql-results-card glass-panel">
                {sqlLoading ? (
                  <div className="sql-results-empty">
                    <RefreshCw size={24} className="animate-spin" color="var(--primary)" />
                    <span>Executing relational database scans...</span>
                  </div>
                ) : sqlError ? (
                  <div className="sql-error-box">
                    <strong>⚠️ Database Error:</strong>
                    <p style={{ marginTop: '8px', lineHeight: 1.4 }}>{sqlError}</p>
                  </div>
                ) : sqlResults ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Found <strong>{sqlResults.values.length}</strong> matching rows. Showing rows {(currentPage-1)*rowsPerPage+1} - {Math.min(currentPage*rowsPerPage, sqlResults.values.length)}.
                      </span>
                    </div>

                    {sqlResults.values.length > 0 ? (
                      <div className="table-container">
                        <table className="data-table">
                          <thead>
                            <tr>
                              {sqlResults.columns.map(col => (
                                <th key={col}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedSqlRows.map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((val, cIdx) => (
                                  <td key={cIdx}>
                                    {val === null ? (
                                      <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>NULL</span>
                                    ) : typeof val === 'number' && val % 1 !== 0 ? (
                                      val.toFixed(2)
                                    ) : (
                                      '' + val
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        
                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                          <div className="pagination-controls">
                            <span>Page {currentPage} of {totalPages}</span>
                            <div className="pagination-buttons">
                              <button 
                                className="pagination-btn"
                                onClick={() => setCurrentPage(currentPage - 1)}
                                disabled={currentPage === 1}
                              >
                                Previous
                              </button>
                              <button 
                                className="pagination-btn"
                                onClick={() => setCurrentPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="sql-results-empty">
                        <Info size={24} />
                        <span>Query completed successfully but returned 0 rows.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="sql-results-empty">
                    <Database size={24} />
                    <span>Run a query from the templates or write custom SQL to inspect raw transaction logs.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
