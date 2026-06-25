-- ==============================================================================
-- E-COMMERCE SALES ANALYTICS: BUSINESS SOLUTIONS
-- Standard ANSI SQL Queries for Executive Reporting and Diagnostic Analysis
-- Compatible with PostgreSQL, MySQL, and SQLite (with minor date function adjustments)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- BUSINESS PROBLEM 1: Which products sell the most?
-- Goal: Identify the top performing products and sub-categories by sales and volume.
-- ------------------------------------------------------------------------------

-- Query 1A: Top 10 Products by Total Sales Revenue
SELECT 
    p.product_id,
    p.product_name,
    p.category,
    p.sub_category,
    ROUND(SUM(od.sales), 2) as total_revenue,
    SUM(od.quantity) as total_quantity_sold,
    ROUND(SUM(od.profit), 2) as total_profit
FROM order_details od
JOIN products p ON od.product_id = p.product_id
GROUP BY p.product_id, p.product_name, p.category, p.sub_category
ORDER BY total_revenue DESC
LIMIT 10;

-- Query 1B: Ranking Sub-Categories within each Category (using SQL Window Functions)
WITH subcat_sales AS (
    SELECT 
        p.category,
        p.sub_category,
        ROUND(SUM(od.sales), 2) as total_sales,
        SUM(od.quantity) as total_quantity,
        ROUND(SUM(od.profit), 2) as total_profit
    FROM order_details od
    JOIN products p ON od.product_id = p.product_id
    GROUP BY p.category, p.sub_category
)
SELECT 
    category,
    sub_category,
    total_sales,
    total_quantity,
    total_profit,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY total_sales DESC) as rank_within_category
FROM subcat_sales
ORDER BY category, rank_within_category;


-- ------------------------------------------------------------------------------
-- BUSINESS PROBLEM 2: Which cities/states generate the highest revenue?
-- Goal: Identify geographical profit centers and key expansion markets.
-- ------------------------------------------------------------------------------

-- Query 2A: Top 10 States by Sales and Profitability
SELECT 
    l.state,
    l.region,
    ROUND(SUM(od.sales), 2) as total_sales,
    ROUND(SUM(od.profit), 2) as total_profit,
    ROUND((SUM(od.profit) / SUM(od.sales)) * 100, 2) as profit_margin_pct,
    COUNT(DISTINCT o.order_id) as total_orders
FROM order_details od
JOIN orders o ON od.order_id = o.order_id
JOIN locations l ON o.postal_code = l.postal_code
GROUP BY l.state, l.region
ORDER BY total_sales DESC
LIMIT 10;

-- Query 2B: Top 10 Profit-Generating Cities
SELECT 
    l.city,
    l.state,
    ROUND(SUM(od.sales), 2) as total_sales,
    ROUND(SUM(od.profit), 2) as net_profit,
    SUM(od.quantity) as total_items_sold
FROM order_details od
JOIN orders o ON od.order_id = o.order_id
JOIN locations l ON o.postal_code = l.postal_code
GROUP BY l.city, l.state
ORDER BY net_profit DESC
LIMIT 10;


-- ------------------------------------------------------------------------------
-- BUSINESS PROBLEM 3: Which customers should be retained? (RFM Customer Segmentation)
-- Goal: Segment customers using Recency, Frequency, and Monetary parameters in SQL.
--       This query ranks customers into 1-5 scores using NTILE window functions.
-- ------------------------------------------------------------------------------

WITH customer_rfm_raw AS (
    -- Step 1: Calculate raw R, F, M values relative to the most recent transaction date
    SELECT 
        o.customer_id,
        c.customer_name,
        c.segment as customer_segment,
        -- Recency: Days since last purchase
        (JULIANDAY((SELECT MAX(order_date) FROM orders)) - JULIANDAY(MAX(o.order_date))) as recency_days,
        -- Frequency: Total orders placed
        COUNT(DISTINCT o.order_id) as frequency_orders,
        -- Monetary: Total dollar amount spent
        SUM(od.sales) as monetary_value
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    JOIN order_details od ON o.order_id = od.order_id
    GROUP BY o.customer_id, c.customer_name, c.segment
),
rfm_scores AS (
    -- Step 2: Assign scores from 1 to 5 using NTILE quintiles
    -- Note: For Recency, smaller days is better, so we ORDER BY recency_days DESC
    SELECT 
        customer_id,
        customer_name,
        customer_segment,
        recency_days,
        frequency_orders,
        monetary_value,
        NTILE(5) OVER (ORDER BY recency_days DESC) as r_score,
        NTILE(5) OVER (ORDER BY frequency_orders ASC) as f_score,
        NTILE(5) OVER (ORDER BY monetary_value ASC) as m_score
    FROM customer_rfm_raw
),
customer_segmentation AS (
    -- Step 3: Segment customers based on R, F, M scores
    SELECT 
        customer_id,
        customer_name,
        customer_segment,
        recency_days,
        frequency_orders,
        monetary_value,
        r_score, f_score, m_score,
        CASE
            WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Champions'
            WHEN r_score >= 3 AND f_score >= 3 AND m_score >= 3 THEN 'Loyal Customers'
            WHEN r_score >= 3 AND f_score >= 1 AND m_score >= 2 THEN 'Potential Loyalists'
            WHEN r_score <= 2 AND f_score >= 2 AND m_score >= 2 THEN 'At Risk'
            WHEN r_score <= 2 AND f_score <= 2 AND m_score <= 2 THEN 'Hibernating'
            ELSE 'About to Sleep'
        END as customer_value_segment
    FROM rfm_scores
)
-- Step 4: Show segment counts, average spending, and active engagement metrics
SELECT 
    customer_value_segment,
    COUNT(*) as customer_count,
    ROUND(AVG(recency_days), 1) as avg_recency_days,
    ROUND(AVG(frequency_orders), 1) as avg_order_frequency,
    ROUND(AVG(monetary_value), 2) as avg_lifetime_spend,
    ROUND(SUM(monetary_value), 2) as total_segment_revenue
FROM customer_segmentation
GROUP BY customer_value_segment
ORDER BY avg_lifetime_spend DESC;


-- ------------------------------------------------------------------------------
-- BUSINESS PROBLEM 4: Why are profits falling? (Discount Profit Erosion Analysis)
-- Goal: Demonstrate the destructive impact of aggressive discounting on net profit.
-- ------------------------------------------------------------------------------

-- Query 4A: Profit Margin by Discount Rate
SELECT 
    discount as discount_rate,
    COUNT(DISTINCT order_id) as order_count,
    SUM(quantity) as items_sold,
    ROUND(SUM(sales), 2) as total_sales,
    ROUND(SUM(profit), 2) as net_profit,
    ROUND((SUM(profit) / SUM(sales)) * 100, 2) as profit_margin_pct
FROM order_details
GROUP BY discount
ORDER BY discount;

-- Query 4B: Identifying Unprofitable Transactions (Highlighting High-Risk Discounts)
-- This query details transactions with discounts >= 30% and their share of total losses.
WITH transaction_losses AS (
    SELECT 
        od.order_id,
        p.category,
        p.sub_category,
        od.discount,
        od.sales,
        od.profit
    FROM order_details od
    JOIN products p ON od.product_id = p.product_id
    WHERE od.profit < 0
)
SELECT 
    CASE 
        WHEN discount < 0.2 THEN 'Low Discount (<20%)'
        WHEN discount = 0.2 THEN 'Moderate Discount (20%)'
        ELSE 'High Discount (>20%)'
    END as discount_tier,
    COUNT(*) as losing_transactions_count,
    ROUND(SUM(sales), 2) as unprofitable_sales,
    ROUND(SUM(profit), 2) as total_financial_loss,
    ROUND(AVG(discount) * 100, 1) as avg_discount_applied
FROM transaction_losses
GROUP BY 
    CASE 
        WHEN discount < 0.2 THEN 'Low Discount (<20%)'
        WHEN discount = 0.2 THEN 'Moderate Discount (20%)'
        ELSE 'High Discount (>20%)'
    END
ORDER BY total_financial_loss ASC;
