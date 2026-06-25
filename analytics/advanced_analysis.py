import os
import sqlite3
import json
from datetime import datetime

def run_advanced_analytics(db_path):
    print(f"Connecting to database at {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # ---------------------------------------------------------
    # 1. RFM Customer Segmentation
    # ---------------------------------------------------------
    print("Running RFM Customer Segmentation...")
    
    # Get the overall maximum date in the database to calculate recency relative to it
    cursor.execute("SELECT MAX(order_date) FROM orders")
    max_date_str = cursor.fetchone()[0]
    max_date = datetime.strptime(max_date_str, "%Y-%m-%d")
    
    # Query Recency, Frequency, Monetary for each customer
    cursor.execute("""
        SELECT 
            c.customer_id,
            c.customer_name,
            c.segment as customer_type,
            MAX(o.order_date) as last_order_date,
            COUNT(DISTINCT o.order_id) as frequency,
            ROUND(SUM(od.sales), 2) as monetary
        FROM customers c
        JOIN orders o ON c.customer_id = o.customer_id
        JOIN order_details od ON o.order_id = od.order_id
        GROUP BY c.customer_id
    """)
    
    rfm_raw = cursor.fetchall()
    
    # Calculate Recency in days
    rfm_data = []
    for row in rfm_raw:
        cust_id, name, cust_type, last_date_str, freq, monet = row
        last_date = datetime.strptime(last_date_str, "%Y-%m-%d")
        recency = (max_date - last_date).days
        rfm_data.append({
            "customer_id": cust_id,
            "customer_name": name,
            "customer_type": cust_type,
            "recency": recency,
            "frequency": freq,
            "monetary": monet
        })
        
    # Helper to calculate quintiles (rank-based scoring from 1 to 5)
    def assign_quintile_scores(data_list, key, reverse=False):
        # Sort data
        sorted_data = sorted(data_list, key=lambda x: x[key], reverse=reverse)
        n = len(sorted_data)
        
        # Assign scores based on rank rank/n
        for idx, item in enumerate(sorted_data):
            rank_ratio = (idx + 1) / n
            if rank_ratio <= 0.2:
                score = 1
            elif rank_ratio <= 0.4:
                score = 2
            elif rank_ratio <= 0.6:
                score = 3
            elif rank_ratio <= 0.8:
                score = 4
            else:
                score = 5
            item[f"{key}_score"] = score
            
    # For Recency: lower days is better -> reverse=True so smaller values get a higher score
    assign_quintile_scores(rfm_data, "recency", reverse=True)
    assign_quintile_scores(rfm_data, "frequency")
    assign_quintile_scores(rfm_data, "monetary")
    
    # Map RFM scores to Customer Value Segments
    # Standard marketing RFM segmentation rules
    for item in rfm_data:
        r, f, m = item["recency_score"], item["frequency_score"], item["monetary_score"]
        
        if r >= 4 and f >= 4 and m >= 4:
            segment = "Champions"
        elif r >= 3 and f >= 3 and m >= 3:
            segment = "Loyal Customers"
        elif r >= 3 and f >= 1 and m >= 2:
            segment = "Potential Loyalists"
        elif r <= 2 and f >= 2 and m >= 2:
            segment = "At Risk"
        elif r <= 2 and f <= 2 and m <= 2:
            segment = "Hibernating"
        else:
            segment = "About to Sleep"
            
        item["segment"] = segment
        
    # Save RFM segments to SQLite Database
    cursor.execute("DROP TABLE IF EXISTS customer_segments")
    cursor.execute("""
        CREATE TABLE customer_segments (
            customer_id TEXT PRIMARY KEY,
            recency INTEGER,
            frequency INTEGER,
            monetary REAL,
            r_score INTEGER,
            f_score INTEGER,
            m_score INTEGER,
            segment TEXT,
            FOREIGN KEY(customer_id) REFERENCES customers(customer_id)
        )
    """)
    
    rfm_tuples = [
        (item["customer_id"], item["recency"], item["frequency"], item["monetary"],
         item["recency_score"], item["frequency_score"], item["monetary_score"], item["segment"])
        for item in rfm_data
    ]
    cursor.executemany("INSERT INTO customer_segments VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rfm_tuples)
    conn.commit()
    print(f"Successfully segmented {len(rfm_data)} customers and saved to 'customer_segments' table.")
    
    # ---------------------------------------------------------
    # 2. Monthly Sales Forecasting (Multiplicative Decomposition)
    # ---------------------------------------------------------
    print("Running Monthly Sales Forecasting...")
    
    # Query monthly sales history
    cursor.execute("""
        SELECT 
            STRFTIME('%Y-%m', o.order_date) as month,
            SUM(od.sales) as monthly_sales
        FROM orders o
        JOIN order_details od ON o.order_id = od.order_id
        GROUP BY month
        ORDER BY month
    """)
    sales_history = cursor.fetchall()
    
    # Prepare monthly data points
    months = [r[0] for r in sales_history]
    sales = [r[1] for r in sales_history]
    N = len(sales)
    
    # We have 36 months of data (2023-01 to 2025-12)
    # Fit a linear trend: Y_trend = a * t + b
    # t is the time index (1 to 36)
    t_values = list(range(1, N + 1))
    sum_t = sum(t_values)
    sum_y = sum(sales)
    sum_t2 = sum(t**2 for t in t_values)
    sum_ty = sum(t * y for t, y in zip(t_values, sales))
    
    # Calculate linear regression slope (a) and intercept (b)
    slope = (N * sum_ty - sum_t * sum_y) / (N * sum_t2 - sum_t**2)
    intercept = (sum_y - slope * sum_t) / N
    
    # Compute Trend values and seasonal ratios
    seasonal_ratios = {m: [] for m in range(1, 13)}  # Month index 1 to 12
    for t, month_str, actual in zip(t_values, months, sales):
        trend = slope * t + intercept
        ratio = actual / trend
        month_num = int(month_str.split("-")[1])
        seasonal_ratios[month_num].append(ratio)
        
    # Calculate average seasonal index for each month
    seasonal_indices = {m: sum(ratios)/len(ratios) for m, ratios in seasonal_ratios.items()}
    
    # Normalize seasonal indices so they average to 1.0
    avg_index = sum(seasonal_indices.values()) / 12
    for m in seasonal_indices:
        seasonal_indices[m] /= avg_index
        
    # Forecast the next 6 months (2026-01 to 2026-06)
    forecast_results = []
    # Start forecasting from month index 37
    start_year = 2026
    for i in range(1, 7):
        t_future = N + i
        month_num = i  # January to June
        month_str = f"{start_year}-{month_num:02d}"
        
        # Forecast = Trend * Seasonal Index
        trend_val = slope * t_future + intercept
        forecast_val = round(trend_val * seasonal_indices[month_num], 2)
        forecast_results.append((month_str, forecast_val))
        
    # Save Forecast to SQLite Database
    cursor.execute("DROP TABLE IF EXISTS sales_forecast")
    cursor.execute("""
        CREATE TABLE sales_forecast (
            month TEXT PRIMARY KEY,
            forecast_sales REAL
        )
    """)
    cursor.executemany("INSERT INTO sales_forecast VALUES (?, ?)", forecast_results)
    conn.commit()
    print(f"Successfully generated 6-month sales forecast and saved to 'sales_forecast' table.")
    
    # ---------------------------------------------------------
    # 3. Export Comprehensive Summary for Dashboard Use
    # ---------------------------------------------------------
    # Create an analytics summary dictionary to save as a JSON file
    # This acts as a static cache for the dashboard, making it load instantly
    summary_data = {
        "rfm_summary": {
            "segments": {},
            "customer_types": {"Consumer": 0, "Corporate": 0, "Home Office": 0}
        },
        "forecast_summary": [],
        "discount_impact": []
    }
    
    # RFM Segment counts
    cursor.execute("SELECT segment, COUNT(*), ROUND(AVG(monetary), 2) FROM customer_segments GROUP BY segment")
    for row in cursor.fetchall():
        summary_data["rfm_summary"]["segments"][row[0]] = {
            "count": row[1],
            "avg_spend": row[2]
        }
        
    # Customer type distribution
    cursor.execute("SELECT segment, COUNT(*) FROM customers GROUP BY segment")
    for row in cursor.fetchall():
        summary_data["rfm_summary"]["customer_types"][row[0]] = row[1]
        
    # Combined history + forecast trend
    for m, s in zip(months, sales):
        summary_data["forecast_summary"].append({
            "month": m,
            "actual": round(s, 2),
            "forecast": None
        })
    for m, f in forecast_results:
        summary_data["forecast_summary"].append({
            "month": m,
            "actual": None,
            "forecast": f
        })
        
    # Discount degradation analysis
    cursor.execute("""
        SELECT 
            discount,
            ROUND(SUM(sales), 2) as total_sales,
            ROUND(SUM(profit), 2) as total_profit,
            COUNT(*) as order_count
        FROM order_details
        GROUP BY discount
        ORDER BY discount
    """)
    for row in cursor.fetchall():
        disc, s, p, c = row
        summary_data["discount_impact"].append({
            "discount": disc,
            "sales": s,
            "profit": p,
            "count": c,
            "margin_pct": round((p / s) * 100, 2) if s > 0 else 0
        })
        
    # Write summary data to JSON
    json_path = os.path.join(os.path.dirname(db_path), "analytics_results.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(summary_data, f, indent=2)
    print(f"Successfully exported dashboard analytics cache to {json_path}")
    
    conn.close()
    print("Advanced analytics pipeline completed successfully.")

if __name__ == "__main__":
    db_file = os.path.join("data", "superstore.db")
    if not os.path.exists(db_file):
        print(f"Error: Database file {db_file} not found. Please run generate_data.py first.")
    else:
        run_advanced_analytics(db_file)
