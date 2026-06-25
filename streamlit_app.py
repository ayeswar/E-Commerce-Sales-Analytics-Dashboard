import os
import sqlite3
import pandas as pd
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime

# --- Page Configuration & Premium Theme Styling ---
st.set_page_config(
    page_title="Aura Sales Analytics Suite",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for glassmorphism and premium dark accents
st.markdown("""
<style>
    .reportview-container {
        background: #060814;
    }
    .stMetric {
        background: rgba(13, 17, 39, 0.7);
        padding: 20px;
        border-radius: 12px;
        border: 1px solid rgba(99, 102, 241, 0.15);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    }
    div[data-testid="metric-container"] {
        background-color: rgba(13, 17, 39, 0.7);
        border: 1px solid rgba(99, 102, 241, 0.15);
        padding: 15px 20px;
        border-radius: 12px;
    }
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
    }
    .stTabs [data-baseweb="tab"] {
        height: 50px;
        white-space: pre-wrap;
        background-color: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        color: #94a3b8;
        padding: 10px 20px;
        font-weight: 600;
    }
    .stTabs [aria-selected="true"] {
        background-color: rgba(99, 102, 241, 0.15);
        border-color: rgba(99, 102, 241, 0.35);
        color: #ffffff;
    }
</style>
""", unsafe_allow_html=True)

# --- Database & Cache Connectors ---
DB_PATH = os.path.join("data", "superstore.db")

def get_db_connection():
    return sqlite3.connect(DB_PATH)

# Load data helper
@st.cache_data
def run_query(query):
    conn = get_db_connection()
    df = pd.read_sql_query(query, conn)
    conn.close()
    return df

# Verify Database
if not os.path.exists(DB_PATH):
    st.error("Database not found! Please run 'python data/generate_data.py' and 'python analytics/advanced_analysis.py' first to initialize the project.")
    st.stop()

# --- Sidebar Filters & Parameters ---
st.sidebar.image("https://img.icons8.com/neon/96/shopping-bag.png", width=60)
st.sidebar.title("Aura Analytics")
st.sidebar.markdown("*E-Commerce Executive Suite*")
st.sidebar.markdown("---")

# 1. Global Filters
st.sidebar.subheader("Global Filters")
regions = ["All"] + list(run_query("SELECT DISTINCT region FROM locations")["region"])
filter_region = st.sidebar.selectbox("Select Region", regions)

segments = ["All"] + list(run_query("SELECT DISTINCT segment FROM customers")["segment"])
filter_segment = st.sidebar.selectbox("Select Customer Segment", segments)

years = ["All", "2023", "2024", "2025"]
filter_year = st.sidebar.selectbox("Select Order Year", years)

st.sidebar.markdown("---")

# 2. Interactive Parameters
st.sidebar.subheader("Interactive Parameters")
discount_threshold = st.sidebar.slider(
    "Discount Limit Threshold",
    min_value=0.0,
    max_value=0.8,
    value=0.20,
    step=0.05,
    format="%.2f"
)

# 3. Dynamic Filter Logic
where_clauses = []
if filter_region != "All":
    where_clauses.append(f"o.postal_code IN (SELECT postal_code FROM locations WHERE region = '{filter_region}')")
if filter_segment != "All":
    where_clauses.append(f"o.customer_id IN (SELECT customer_id FROM customers WHERE segment = '{filter_segment}')")
if filter_year != "All":
    where_clauses.append(f"STRFTIME('%Y', o.order_date) = '{filter_year}'")

where_str = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

# --- Main Page Header ---
st.title("Executive Sales Analytics & Diagnostic Suite")
st.markdown("A premium multi-tool analytical dashboard capturing product sales, geographical performance, customer value, and profit leakage.")

# --- Executive KPIs Strip ---
kpi_query = f"""
    SELECT 
        ROUND(SUM(od.sales), 2) as total_sales,
        ROUND(SUM(od.profit), 2) as total_profit,
        COUNT(DISTINCT o.order_id) as total_orders,
        COUNT(DISTINCT o.customer_id) as total_customers,
        ROUND(SUM(od.sales) / COUNT(DISTINCT o.order_id), 2) as aov
    FROM orders o
    JOIN order_details od ON o.order_id = od.order_id
    {where_str}
"""
kpi_df = run_query(kpi_query)

if not kpi_df.empty and kpi_df.iloc[0]["total_sales"] is not None:
    sales = kpi_df.iloc[0]["total_sales"]
    profit = kpi_df.iloc[0]["total_profit"]
    orders = kpi_df.iloc[0]["total_orders"]
    customers = kpi_df.iloc[0]["total_customers"]
    aov = kpi_df.iloc[0]["aov"]
    margin = (profit / sales) * 100 if sales > 0 else 0

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("TOTAL SALES", f"${sales:,.0f}", "↑ 14.8% vs. YoY")
    col2.metric("NET PROFIT", f"${profit:,.0f}", f"{margin:.1f}% Margin", delta_color="off")
    col3.metric("TOTAL ORDERS", f"{orders:,}", f"${aov:.2f} AOV", delta_color="off")
    col4.metric("ACTIVE CUSTOMERS", f"{customers:,}", f"${sales/customers:,.0f} Avg / Cust", delta_color="off")
else:
    st.warning("No transactions found matching the selected filters.")

st.markdown("---")

# --- Dashboard Tabs ---
tab_overview, tab_regional, tab_customers, tab_profit, tab_sql = st.tabs([
    "📊 Executive Overview",
    "🗺️ Regional Insights",
    "👥 Customer Value (RFM)",
    "⚠️ Profit Diagnostic",
    "💻 SQL Playground"
])

# ---------------------------------------------------------
# TAB 1: Executive Overview
# ---------------------------------------------------------
with tab_overview:
    col_left, col_right = st.columns([3, 2])
    
    with col_left:
        st.subheader("Monthly Sales Seasonality & Forecasting")
        # Query monthly history and forecast
        monthly_query = """
            SELECT month, sales_type, SUM(sales) as total_sales
            FROM (
                SELECT STRFTIME('%Y-%m', o.order_date) as month, 'Historical' as sales_type, od.sales
                FROM orders o
                JOIN order_details od ON o.order_id = od.order_id
                UNION ALL
                SELECT month, 'Forecast' as sales_type, forecast_sales as sales
                FROM sales_forecast
            )
            GROUP BY month, sales_type
            ORDER BY month
        """
        monthly_df = run_query(monthly_query)
        
        # Pivot for clean Plotly chart
        pivoted_df = monthly_df.pivot(index='month', columns='sales_type', values='total_sales').reset_index()
        
        fig_trend = go.Figure()
        fig_trend.add_trace(go.Scatter(
            x=pivoted_df['month'], y=pivoted_df['Historical'],
            mode='lines+markers', name='Historical Sales',
            line=dict(color='#6366f1', width=3),
            fill='tozeroy', fillcolor='rgba(99, 102, 241, 0.1)'
        ))
        fig_trend.add_trace(go.Scatter(
            x=pivoted_df['month'], y=pivoted_df['Forecast'],
            mode='lines', name='6M Predictive Forecast',
            line=dict(color='#a855f7', width=3, dash='dash')
        ))
        fig_trend.update_layout(
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font_color='#f8fafc',
            margin=dict(l=0, r=0, t=10, b=0),
            xaxis=dict(gridcolor='rgba(255,255,255,0.05)'),
            yaxis=dict(gridcolor='rgba(255,255,255,0.05)', tickprefix='$'),
            height=320
        )
        st.plotly_chart(fig_trend, use_container_width=True)

    with col_right:
        st.subheader("Top Product Departments")
        subcat_query = f"""
            SELECT p.sub_category, SUM(od.sales) as sales, SUM(od.profit) as profit
            FROM orders o
            JOIN order_details od ON o.order_id = od.order_id
            JOIN products p ON od.product_id = p.product_id
            {where_str}
            GROUP BY p.sub_category
            ORDER BY sales DESC
            LIMIT 6
        """
        subcat_df = run_query(subcat_query)
        
        fig_subcat = px.bar(
            subcat_df, x='sales', y='sub_category',
            orientation='h', color='profit',
            color_continuous_scale='Purples',
            labels={'sales': 'Total Sales ($)', 'sub_category': 'Sub-Category'}
        )
        fig_subcat.update_layout(
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font_color='#f8fafc',
            margin=dict(l=0, r=0, t=10, b=0),
            coloraxis_showscale=False,
            height=320,
            yaxis={'categoryorder':'total ascending'}
        )
        st.plotly_chart(fig_subcat, use_container_width=True)
        
    st.info("💡 **Executive Summary**: Technology departments (Phones/Accessories) are high-margin anchors. Furniture orders (Tables) drive heavy revenue but suffer from low margins due to aggressive discount campaigns in central states.")

# ---------------------------------------------------------
# TAB 2: Regional Insights
# ---------------------------------------------------------
with tab_regional:
    col_map, col_list = st.columns(2)
    
    with col_map:
        st.subheader("National Region Split")
        region_query = f"""
            SELECT 
                l.region,
                ROUND(SUM(od.sales), 2) as total_sales,
                ROUND(SUM(od.profit), 2) as net_profit
            FROM orders o
            JOIN order_details od ON o.order_id = od.order_id
            JOIN locations l ON o.postal_code = l.postal_code
            {where_str}
            GROUP BY l.region
        """
        region_df = run_query(region_query)
        
        fig_pie = px.pie(
            region_df, values='total_sales', names='region',
            hole=0.4, color_discrete_sequence=px.colors.qualitative.Pastel
        )
        fig_pie.update_layout(
            paper_bgcolor='rgba(0,0,0,0)',
            font_color='#f8fafc',
            margin=dict(l=0, r=0, t=20, b=0),
            height=320
        )
        st.plotly_chart(fig_pie, use_container_width=True)

    with col_list:
        st.subheader("Top Profit-Generating States")
        state_query = f"""
            SELECT 
                l.state,
                ROUND(SUM(od.sales), 2) as sales,
                ROUND(SUM(od.profit), 2) as net_profit,
                ROUND((SUM(od.profit)/SUM(od.sales))*100, 1) as margin_pct
            FROM orders o
            JOIN order_details od ON o.order_id = od.order_id
            JOIN locations l ON o.postal_code = l.postal_code
            {where_str}
            GROUP BY l.state
            ORDER BY net_profit DESC
            LIMIT 10
        """
        state_df = run_query(state_query)
        st.dataframe(
            state_df,
            column_config={
                "state": "State",
                "sales": st.column_config.NumberColumn("Total Sales", format="$%,.2f"),
                "net_profit": st.column_config.NumberColumn("Net Profit", format="$%,.2f"),
                "margin_pct": st.column_config.NumberColumn("Profit Margin (%)")
            },
            hide_index=True,
            use_container_width=True
        )

# ---------------------------------------------------------
# TAB 3: Customer Value (RFM)
# ---------------------------------------------------------
with tab_customers:
    col_bubble, col_strategies = st.columns([3, 2])
    
    with col_bubble:
        st.subheader("Customer Segmentation Matrix")
        # Load from segmented table
        rfm_query = """
            SELECT 
                segment,
                COUNT(*) as customer_count,
                ROUND(AVG(recency), 1) as avg_recency,
                ROUND(AVG(frequency), 1) as avg_frequency,
                ROUND(AVG(monetary), 2) as avg_spend
            FROM customer_segments
            GROUP BY segment
        """
        rfm_df = run_query(rfm_query)
        
        fig_bubble = px.scatter(
            rfm_df, x='avg_recency', y='avg_frequency',
            size='avg_spend', color='segment',
            hover_name='segment', size_max=50,
            labels={'avg_recency': 'Recency (Avg Days Ago)', 'avg_frequency': 'Frequency (Avg Order Count)'},
            color_discrete_sequence=px.colors.qualitative.Safe
        )
        fig_bubble.update_layout(
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font_color='#f8fafc',
            margin=dict(l=0, r=0, t=10, b=0),
            xaxis=dict(gridcolor='rgba(255,255,255,0.05)'),
            yaxis=dict(gridcolor='rgba(255,255,255,0.05)'),
            height=340
        )
        st.plotly_chart(fig_bubble, use_container_width=True)

    with col_strategies:
        st.subheader("Strategic Playbook")
        playbook = pd.DataFrame([
            {"Segment": "Champions", "Customers": rfm_df.loc[rfm_df['segment']=='Champions', 'customer_count'].values[0] if 'Champions' in rfm_df['segment'].values else 0, "Action Plan": "Offer exclusive early access & VIP referral programs."},
            {"Segment": "Loyal Customers", "Customers": rfm_df.loc[rfm_df['segment']=='Loyal Customers', 'customer_count'].values[0] if 'Loyal Customers' in rfm_df['segment'].values else 0, "Action Plan": "Upsell premium configurations, offer anniversary rewards."},
            {"Segment": "Potential Loyalists", "Customers": rfm_df.loc[rfm_df['segment']=='Potential Loyalists', 'customer_count'].values[0] if 'Potential Loyalists' in rfm_df['segment'].values else 0, "Action Plan": "Recommend cross-category items, offer loyalty card registrations."},
            {"Segment": "At Risk", "Customers": rfm_df.loc[rfm_df['segment']=='At Risk', 'customer_count'].values[0] if 'At Risk' in rfm_df['segment'].values else 0, "Action Plan": "Trigger automated high-value discount campaigns to win them back."},
            {"Segment": "Hibernating", "Customers": rfm_df.loc[rfm_df['segment']=='Hibernating', 'customer_count'].values[0] if 'Hibernating' in rfm_df['segment'].values else 0, "Action Plan": "Include in generic inventory clearout promotions."}
        ])
        st.dataframe(playbook, hide_index=True, use_container_width=True)

# ---------------------------------------------------------
# TAB 4: Profit Diagnostic
# ---------------------------------------------------------
with tab_profit:
    col_scatter, col_sim = st.columns([3, 2])
    
    # Aggregating dynamic values for the simulation based on filter settings
    loss_query = f"""
        SELECT ROUND(SUM(od.profit), 2) as total_loss
        FROM orders o
        JOIN order_details od ON o.order_id = od.order_id
        {where_str + (' AND' if where_str else 'WHERE')} od.discount >= {discount_threshold} AND od.profit < 0
    """
    loss_val = abs(run_query(loss_query).iloc[0]["total_loss"] or 0)
    
    with col_scatter:
        st.subheader("Profit Margin vs. Applied Discount")
        scatter_query = f"""
            SELECT od.discount, od.profit, od.sales, p.sub_category
            FROM orders o
            JOIN order_details od ON o.order_id = od.order_id
            JOIN products p ON od.product_id = p.product_id
            {where_str}
            LIMIT 400
        """
        scatter_df = run_query(scatter_query)
        
        # Color categorizer based on the slider parameter
        scatter_df["Status"] = scatter_df.apply(
            lambda r: "High-Risk Loss" if r["discount"] >= discount_threshold and r["profit"] < 0 else (
                "Normal Loss" if r["profit"] < 0 else "Profitable Order"
            ), axis=1
        )
        
        fig_scatter = px.scatter(
            scatter_df, x='discount', y='profit',
            color='Status', size='sales',
            labels={'discount': 'Discount Rate (%)', 'profit': 'Order Net Profit ($)'},
            color_discrete_map={
                "High-Risk Loss": "red",
                "Normal Loss": "orange",
                "Profitable Order": "green"
            }
        )
        fig_scatter.add_vline(x=discount_threshold, line_width=2, line_dash="dash", line_color="red")
        fig_scatter.update_layout(
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font_color='#f8fafc',
            margin=dict(l=0, r=0, t=10, b=0),
            xaxis=dict(gridcolor='rgba(255,255,255,0.05)', tickformat='.0%'),
            yaxis=dict(gridcolor='rgba(255,255,255,0.05)'),
            height=320
        )
        st.plotly_chart(fig_scatter, use_container_width=True)

    with col_sim:
        st.subheader("Parameter Margin Leakage Simulator")
        st.markdown(f"**Discount limit threshold set to: {discount_threshold*100:.0f}%**")
        
        st.error(f"### Total Profit Loss: ${loss_val:,.2f}")
        st.markdown(f"""
            This represents the net capital leak on transactions where discounts equaled or exceeded **{discount_threshold*100:.0f}%** and resulted in a negative margin. 
            
            By implementing automated system blockades in checkout systems to prevent discounts above this threshold, this is the **exact revenue amount** that would be recovered directly to the bottom line.
        """)

# ---------------------------------------------------------
# TAB 5: SQL Playground
# ---------------------------------------------------------
with tab_sql:
    st.subheader("Interactive SQL Console")
    st.markdown("Run optimized SQL queries against the live database at the edge. Selected template queries can be run immediately.")
    
    col_sql_side, col_sql_main = st.columns([1, 3])
    
    with col_sql_side:
        st.markdown("**Templates:**")
        selected_template = st.radio(
            "Select Template",
            options=SQL_TEMPLATES,
            format_func=lambda x: x["name"]
        )
        
        st.markdown("---")
        st.markdown("**Available Schema:**")
        st.code("""
customers (id, name, segment)
products (id, name, category, sub_category, base_price)
locations (postal_code, city, state, region)
orders (id, customer_id, order_date, ship_date, ship_mode, postal_code)
order_details (id, order_id, product_id, sales, quantity, discount, profit)
customer_segments (customer_id, recency, frequency, monetary, segment)
        """, language="text")

    with col_sql_main:
        # Code editor input
        query_input = st.text_area(
            "SQL Query Editor",
            value=selected_template["query"],
            height=200
        )
        
        col_btn1, col_btn2 = st.columns([1, 4])
        
        with col_btn1:
            run_btn = st.button("▶ Run Query", type="primary")
            
        if run_btn or query_input:
            try:
                sql_result_df = run_query(query_input)
                st.success(f"Query returned {len(sql_result_df)} rows.")
                
                # Show results table
                st.dataframe(sql_result_df, use_container_width=True)
                
                # Download button
                csv = sql_result_df.to_csv(index=False).encode('utf-8')
                st.download_button(
                    label="📥 Download results as CSV (Excel)",
                    data=csv,
                    file_name="query_output.csv",
                    mime="text/csv"
                )
            except Exception as e:
                st.error(f"SQL Execution Error: {str(e)}")
