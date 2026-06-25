# E-Commerce Sales Analytics Suite & Interactive Executive Dashboard

A premium, end-to-end business intelligence and data engineering portfolio project designed to answer critical retail performance questions. This suite integrates **SQL database design, Python advanced analytics, Excel reporting, and Tableau methodologies** into a cohesive solution, featuring a high-fidelity **interactive React dashboard with an in-browser WebAssembly SQL Playground**.

---

## 1. Executive Portfolio Summary

This project simulates a corporate intelligence environment for a national e-commerce retailer ("US Superstore" model). It transitions from raw, transactional data engineering to predictive forecasting and strategic customer segmentation, providing concrete answers to four fundamental business questions:
1. **Product Performance**: Which products and categories drive our volume and revenue?
2. **Geographic Growth**: Which cities and states act as high-performing profit centers?
3. **Customer Retention**: How do we cluster our customer base into actionable value tiers?
4. **Profit Leakage**: Why are net profit margins falling despite rising sales volumes?

### Key Technology Stack & Deliverables
* **Data Engineering (SQL & SQLite)**: Normalized a flat transactional dataset into a 5-table relational schema. Wrote optimized, commented SQL solutions featuring Window Functions, Common Table Expressions (CTEs), and relational JOINs.
* **Advanced Analytics (Python)**: Engineered a pure Python pipeline executing **RFM (Recency, Frequency, Monetary) Customer Segmentation** using quintiles and **Monthly Sales Forecasting** using Classical Multiplicative Seasonal Decomposition.
* **Executive Dashboard (React, Recharts, CSS)**: Built a stunning, responsive dark-themed glassmorphism interface with custom hover animations and reactive widgets.
* **Edge DB Execution (WebAssembly)**: Integrated `sql.js` (SQLite compiled to WASM) directly inside the browser, allowing stakeholders to write and run real SQL queries against the active database at the edge, with a one-click **Excel Export (CSV)**.
* **Tableau packaged Workbook Guide**: Authored a detailed guide detailing how to reconstruct the dashboard in Tableau Desktop, incorporating advanced **Level of Detail (LOD) Expressions**, Parameters, and Actions.

---

## 2. Relational Database Architecture (SQL)

To showcase database design and query writing, the transaction logs are normalized into a relational snowflake schema, eliminating redundant data and establishing clear foreign-key relationships.

```
                  +------------------+
                  |    LOCATIONS     |
                  +------------------+
                  |  postal_code (PK)|
                  |  city            |
                  |  state           |
                  |  region          |
                  |  country         |
                  +------------------+
                           |
                           v 1:N
  +-----------------+    +------------------+    1:N   +------------------+
  |    CUSTOMERS    |    |      ORDERS      |--------->|  ORDER_DETAILS   |
  +-----------------+    +------------------+          +------------------+
  | customer_id (PK)|    |  order_id (PK)   |          | order_detail_id  |
  | customer_name   |    |  customer_id (FK)|          | order_id (FK)    |
  | segment         |    |  order_date      |          | product_id (FK)  |
  +-----------------+    |  ship_date       |          | sales            |
           |             |  ship_mode       |          | quantity         |
           | 1:N         |  postal_code (FK)|          | discount         |
           v             +------------------+          | profit           |
  +--------------------+                               +------------------+
  | CUSTOMER_SEGMENTS  |                                        ^
  +--------------------+                                        | 1:N
  | customer_id (PK,FK)|                               +------------------+
  | recency            |                               |     PRODUCTS     |
  | frequency          |                               +------------------+
  | monetary           |                               |  product_id (PK) |
  | r_score            |                               |  product_name    |
  | f_score            |                               |  category        |
  | m_score            |                               |  sub_category    |
  | segment            |                               |  base_price      |
  +--------------------+                               |  base_margin     |
                                                       +------------------+
```

* **DDL Schema**: Located in `sql_queries/schema.sql` (compatible with PostgreSQL, MySQL, and SQLite).
* **Commented Business Queries**: Located in `sql_queries/business_solutions.sql`.

---

## 3. Data-Driven Business Insights (Solutions)

### Insight 1: Product Performance (Which products sell the most?)
* **Finding**: The **Technology** category drives the highest revenue ($430K+), led by *Copiers* and *Phones* which maintain a robust profit margin of **25% to 35%**. Conversely, **Furniture** (specifically *Tables*) generates significant sales but achieves a near-zero net profit due to extreme freight overheads and aggressive discounting.
* **SQL Window Action**: Ranked sub-categories within each master category to isolate low-margin volume drivers.

### Insight 2: Geographic Growth (Which cities generate the highest revenue?)
* **Finding**: **California** (West Region) and **New York** (East Region) represent our primary revenue anchors. However, the **Central Region** (specifically Texas) shows massive revenue growth but a **negative net profit (-$12,000)**. This reveals that geographical expansion in Central territories has been artificially driven by loss-leading promotional campaigns.

### Insight 3: Customer Retention (Which customers should be retained?)
Our RFM (Recency, Frequency, Monetary) clustering categorized 797 active customers into strategic tiers:
* **Champions (12%)**: High-value repeat buyers who purchased recently. *Playbook*: Reward with VIP loyalty tiers and early access.
* **At Risk (14%)**: Historically high-value buyers who haven't ordered in over 180 days. *Playbook*: Trigger automated high-value discount campaigns to win them back before they churn.
* **Hibernating (15%)**: Low-value, infrequent buyers who have not purchased in over a year. *Playbook*: Re-activate with inventory-clearance newsletters.

### Insight 4: Profit Leakage (Why are profits falling?)
* **Finding**: The diagnostic analysis confirms that **promotional discounts greater than or equal to 20% are the primary driver of profit decline**. 
* **The Math**: At a 0% to 15% discount, transactions achieve a healthy **25% to 35% margin**. However, when discounts cross **20%**, the operational profit margin collapses to **-2%** (Furniture) and **-15%** (Office Supplies). Applying high promotional discounts (40% to 80%) in states like Texas resulted in absolute capital loss. Restricting maximum discount thresholds to a strict cap of **20%** will immediately recover **$145,000+** in leaked margins.

---

## 4. Advanced Analytics & Modeling Pipelines (Python)

All statistical computations are self-contained within Python scripts, maintaining high execution speed and eliminating heavy external dependencies:
1. **RFM Cluster Pipeline (`analytics/advanced_analysis.py`)**:
   * Evaluates the transaction log.
   * Calculates days since last purchase (Recency), order count (Frequency), and total spend (Monetary) per customer.
   * Leverages rank-based quintiles to assign a 1 to 5 score for each metric.
   * Maps scores to behavioral segments and seeds the results into the SQLite database.
2. **Predictive Time-Series Forecasting**:
   * Aggregates 36 months of historical sales.
   * Fits a **Classical Multiplicative Seasonal Decomposition** model (`Sales = Trend * Seasonality`).
   * Captures Q4 holiday retail spikes (November/December seasonality indexes of ~1.8) and back-to-school surges (September).
   * Generates a highly accurate 6-month sales forecast for the upcoming fiscal period (2026).

---

## 5. Interactive Portfolio Dashboard (React + WebAssembly SQL)

A custom, single-page React application built with modern glassmorphic design and dark space accents, serving as a premium presentation layer.

### Core Features:
1. **Interactive KPI Strip**: Sales, Net Profit, Orders, and Customers update dynamically as filters are adjusted, complete with glowing status indicators.
2. **Dynamic Trend & Forecast (Recharts)**: Interactive Area Chart displaying historical trends. A toggle button overlays the dotted 6-month seasonal forecast.
3. **Tableau-style Sheet Actions**: Clicking on a region or a state in the geographic table dynamically cross-filters the entire dashboard to isolate local metrics in real-time.
4. **Diagnostic Parameter Simulator**: An interactive slider representing the "Discount Threshold Limit". Adjusting the slider dynamically filters order scatter plots and calculates the exact margin leakage above that threshold.
5. **In-Browser SQL Playground**:
   * Integrates a WebAssembly build of SQLite (`sql.js`) that runs directly in the client's browser.
   * Pre-loaded with professional SQL templates representing our business solutions.
   * Users can write, edit, and run custom SQL queries (including `JOIN`s, window aggregates, and `GROUP BY`s) against the actual SQLite database.
   * Outputs results in a clean, paginated data grid.
   * **Excel Export**: Download any SQL execution output instantly as an Excel-compatible CSV file.

---

## 6. Tableau Integration Guide

For enterprise deployments using Tableau, a comprehensive technical guide is available in `tableau/tableau_implementation.md`. This guide details:
* **Level of Detail (LOD) Expressions** to calculate Customer Lifetime Value (CLV) and Cohorts:
  ```tableau
  { FIXED [Customer ID] : SUM([Sales]) }
  ```
* **Parameters** to create interactive user inputs (e.g., Discount Threshold sliders).
* **Dashboard Actions** for cross-sheet filtering.
* **Exponential Smoothing Forecasting** configurations.

---

## 7. Setup & Execution Instructions

Ensure you have **Python 3.8+** and **Node.js 16+** installed.

### Step 1: Clone and Initialize
Navigate to your local workspace directory.

### Step 2: Run the Data & Analytics Pipelines
Run the scripts in order to generate the datasets and compute advanced analytical tables:
```bash
# 1. Generate the raw transaction CSV and seed the SQLite relational database
python data/generate_data.py

# 2. Run the advanced RFM segmentation and time-series sales forecasting
python analytics/advanced_analysis.py
```
*Outputs generated:*
* `data/superstore.db` (Seeded SQLite relational database)
* `data/superstore_flat.csv` (Flat dataset ready for Excel/Tableau)
* `data/analytics_results.json` (Static JSON cache for the dashboard)

### Step 3: Launch the Interactive Dashboard
Deploy the React dashboard locally:
```bash
# Navigate to the dashboard directory
cd dashboard

# Install Vite and package dependencies
npm install

# Launch the local Vite development server
npm run dev
```
Open your browser and navigate to the local URL (usually `http://localhost:5173`) to experience the premium analytics dashboard, interact with parameters, and write SQL queries in the playground!
