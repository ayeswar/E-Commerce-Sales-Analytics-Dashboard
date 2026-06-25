import os
import csv
import sqlite3
import random
from datetime import datetime, timedelta

# Set random seed for reproducibility
random.seed(42)

# --- Configuration & Constants ---
START_DATE = datetime(2023, 1, 1)
END_DATE = datetime(2025, 12, 31)

SEGMENTS = ["Consumer", "Corporate", "Home Office"]
SHIP_MODES = ["Standard Class", "Second Class", "First Class", "Same Day"]
REGIONS = {
    "East": [
        ("New York", "New York", "10001"),
        ("New York", "Buffalo", "14201"),
        ("Pennsylvania", "Philadelphia", "19104"),
        ("Pennsylvania", "Pittsburgh", "15201"),
        ("Massachusetts", "Boston", "02108"),
        ("Ohio", "Columbus", "43215"),
        ("Ohio", "Cleveland", "44114")
    ],
    "West": [
        ("California", "Los Angeles", "90012"),
        ("California", "San Francisco", "94102"),
        ("California", "San Diego", "92101"),
        ("Washington", "Seattle", "98101"),
        ("Oregon", "Portland", "97201"),
        ("Colorado", "Denver", "80202"),
        ("Arizona", "Phoenix", "85001")
    ],
    "Central": [
        ("Texas", "Houston", "77002"),
        ("Texas", "Dallas", "75201"),
        ("Texas", "Austin", "78701"),
        ("Illinois", "Chicago", "60601"),
        ("Michigan", "Detroit", "48201"),
        ("Minnesota", "Minneapolis", "55401"),
        ("Indiana", "Indianapolis", "46201")
    ],
    "South": [
        ("Florida", "Miami", "33101"),
        ("Florida", "Tampa", "33602"),
        ("Georgia", "Atlanta", "30303"),
        ("North Carolina", "Charlotte", "28202"),
        ("Tennessee", "Nashville", "37201"),
        ("Kentucky", "Louisville", "40202"),
        ("Virginia", "Richmond", "23219")
    ]
}

CATEGORIES = {
    "Technology": {
        "Phones": (150, 1000, 0.25),      # (min_price, max_price, profit_margin)
        "Accessories": (20, 250, 0.20),
        "Machines": (400, 3000, 0.12),
        "Copiers": (800, 9000, 0.35)
    },
    "Office Supplies": {
        "Paper": (5, 80, 0.40),
        "Binders": (2, 150, 0.45),
        "Art": (3, 50, 0.30),
        "Storage": (15, 400, 0.18),
        "Appliances": (50, 600, 0.22),
        "Fasteners": (1, 20, 0.35),
        "Envelopes": (2, 35, 0.35),
        "Labels": (2, 25, 0.35),
        "Supplies": (5, 100, 0.10)
    },
    "Furniture": {
        "Chairs": (80, 700, 0.15),
        "Chairs-Ergonomic": (200, 1200, 0.18),
        "Furnishings": (10, 150, 0.20),
        "Bookcases": (100, 1000, 0.05),
        "Tables": (150, 2000, 0.02)  # Low base margin, highly vulnerable to discounts
    }
}

# --- Data Generation Helper Functions ---

def generate_customers(num_customers=750):
    first_names = ["John", "Jane", "Robert", "Mary", "Michael", "Patricia", "William", "Elizabeth", "David", "Linda", 
                   "Richard", "Barbara", "Joseph", "Susan", "Thomas", "Jessica", "Charles", "Sarah", "Christopher", "Karen",
                   "Daniel", "Nancy", "Matthew", "Lisa", "Anthony", "Betty", "Mark", "Margaret", "Donald", "Sandra"]
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", 
                  "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
                  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson"]
    
    customers = []
    for i in range(1, num_customers + 1):
        cust_id = f"{random.choice(['JS', 'KA', 'MD', 'PL', 'TB', 'ZC', 'AR', 'HL', 'CH'])}-{10000 + i}"
        name = f"{random.choice(first_names)} {random.choice(last_names)}"
        segment = random.choice(SEGMENTS)
        customers.append((cust_id, name, segment))
    return customers

def generate_products():
    products = []
    prod_counters = {}
    
    # Adjectives and nouns to make product names sound realistic
    brand_prefixes = ["Logitech", "HP", "Canon", "Apple", "Samsung", "Dell", "Brother", "Wilson Jones", "Avery", 
                      "BIC", "Smead", "Hon", "Global", "Bush", "Sauder", "Xerox", "GBC", "Fellowes"]
    
    product_nouns = {
        "Phones": ["Smartphone", "Office Phone", "Wireless Handset", "Conference Phone"],
        "Accessories": ["Wireless Mouse", "Mechanical Keyboard", "USB-C Hub", "Headset", "External SSD", "Webcam"],
        "Machines": ["3D Printer", "Laser Engraver", "Heavy Duty Shredder", "Binding Machine"],
        "Copiers": ["Multi-Function Copier", "High-Volume Color Copier", "Digital Copier"],
        "Paper": ["Premium Laser Paper", "Recycled Copy Paper", "Multipurpose Cardstock", "Photo Paper"],
        "Binders": ["Ring Binder", "Clear Cove Binder", "Heavy Duty View Binder", "Presentation Folder"],
        "Art": ["Colored Pencils", "Sketchbook", "Acrylic Paint Set", "Permanent Markers", "Watercolor Set"],
        "Storage": ["Plastic Storage Bin", "Mobile Filing Cabinet", "Heavy Duty Shelving", "Stacking Drawers"],
        "Appliances": ["Compact Refrigerator", "Microwave Oven", "Air Purifier", "Space Heater", "Water Cooler"],
        "Fasteners": ["Paper Clips", "Binder Clips", "Rubber Bands", "Push Pins", "Staples"],
        "Envelopes": ["Catalog Envelopes", "Self-Seal Envelopes", "Bubble Mailers", "Security Tint Envelopes"],
        "Labels": ["Address Labels", "Shipping Labels", "File Folder Labels", "Color-Coding Dots"],
        "Supplies": ["High-Quality Scissors", "Paper Trimmer", "Heavy Duty Stapler", "Tape Dispenser"],
        "Chairs": ["Executive Leather Chair", "Mesh Task Chair", "Stool", "Fabric Drafting Chair"],
        "Chairs-Ergonomic": ["Ergonomic Lumbar Support Chair", "Active Sitting Stool", "Premium Kneeling Chair"],
        "Furnishings": ["Desk Lamp", "Floor Mat", "Wall Clock", "Wastebasket", "Desktop Organizer"],
        "Bookcases": ["Wood Bookcase", "Metal Bookcase", "Corner Bookshelf", "Library Shelving"],
        "Tables": ["Conference Table", "Writing Desk", "Training Table", "Adjustable Standing Desk", "Computer Desk"]
    }
    
    for category, subcats in CATEGORIES.items():
        for subcat, (min_p, max_p, margin) in subcats.items():
            # Create ~15-30 products per sub-category
            num_prods = random.randint(15, 30)
            prefix = category[:3].upper()
            
            # Map sub-category folder name to product code name
            subcat_code = subcat.replace("-Ergonomic", "")[:2].upper()
            
            for i in range(1, num_prods + 1):
                prod_id = f"{prefix}-{subcat_code}-1000{1000 + len(products)}"
                brand = random.choice(brand_prefixes)
                noun = random.choice(product_nouns[subcat])
                model = f"v{random.randint(1, 12)}.{random.randint(0, 9)}"
                prod_name = f"{brand} {noun} {model}"
                
                base_price = round(random.uniform(min_p, max_p), 2)
                products.append((prod_id, prod_name, category, subcat, base_price, margin))
                
    return products

# --- Core Data Generation ---

def generate_transactions(customers, products, num_orders=4800):
    orders = []
    order_details = []
    
    # Flatten locations for random selections
    locations_list = []
    for region, locs in REGIONS.items():
        for state, city, zip_code in locs:
            locations_list.append((zip_code, city, state, region))
            
    # Assign a primary location to each customer to maintain customer location consistency
    customer_locations = {cust[0]: random.choice(locations_list) for cust in customers}
    
    # Date weights for seasonality (peak Q4, spike in Sept, dip in Jan/Feb)
    def get_seasonal_date():
        delta_days = (END_DATE - START_DATE).days
        while True:
            random_days = random.randint(0, delta_days)
            date = START_DATE + timedelta(days=random_days)
            month = date.month
            
            # Calculate a probability weight based on month
            # Nov/Dec: high weight (1.0)
            # Sept (back to school): medium-high (0.85)
            # Mar/June: medium (0.7)
            # Jan/Feb: low (0.4)
            if month in [11, 12]:
                weight = 1.0
            elif month in [9]:
                weight = 0.85
            elif month in [3, 5, 6, 10]:
                weight = 0.75
            else:
                weight = 0.45
                
            if random.random() < weight:
                return date

    detail_id_counter = 1
    
    for order_seq in range(1, num_orders + 1):
        order_date = get_seasonal_date()
        customer = random.choice(customers)
        cust_id = customer[0]
        postal_code, city, state, region = customer_locations[cust_id]
        
        # Order ID format: CA-Year-Sequence
        order_id = f"CA-{order_date.year}-{100000 + order_seq}"
        
        # Shipping Mode and Delays
        ship_mode = random.choice(SHIP_MODES)
        if ship_mode == "Same Day":
            ship_delay = 0
        elif ship_mode == "First Class":
            ship_delay = random.randint(1, 2)
        elif ship_mode == "Second Class":
            ship_delay = random.randint(2, 4)
        else: # Standard Class
            ship_delay = random.randint(3, 6)
            # Add seasonal holiday delays in Nov/Dec
            if order_date.month in [11, 12]:
                ship_delay += random.randint(1, 3)
                
        ship_date = order_date + timedelta(days=ship_delay)
        
        orders.append((
            order_id,
            cust_id,
            order_date.strftime("%Y-%m-%d"),
            ship_date.strftime("%Y-%m-%d"),
            ship_mode,
            postal_code
        ))
        
        # Number of items in this order (typically 1 to 4, heavy-tail)
        num_items = random.choices([1, 2, 3, 4, 5], weights=[60, 23, 10, 5, 2])[0]
        selected_products = random.sample(products, num_items)
        
        # Regional discount factors (e.g. Texas, Illinois, Ohio, Pennsylvania have higher discount rates)
        has_high_discount_state = state in ["Texas", "Illinois", "Ohio", "Pennsylvania"]
        
        for prod in selected_products:
            prod_id, prod_name, category, subcat, base_price, margin = prod
            
            qty = random.choices([1, 2, 3, 4, 5, 7, 10], weights=[55, 25, 10, 5, 3, 1, 1])[0]
            
            # Determine discount rate based on state, sub-category, and randomness
            # Standard discount options: 0%, 10%, 20%
            discount = 0.0
            
            # Furniture (especially Tables and Bookcases) are often discounted
            if subcat in ["Tables", "Bookcases"]:
                discount = random.choices([0.0, 0.2, 0.3, 0.5], weights=[30, 30, 20, 20])[0]
            elif has_high_discount_state:
                # High discount states apply heavy promotional campaigns
                discount = random.choices([0.0, 0.2, 0.4, 0.6, 0.8], weights=[20, 30, 20, 20, 10])[0]
            else:
                # Normal discounting
                discount = random.choices([0.0, 0.1, 0.15, 0.2], weights=[70, 15, 10, 5])[0]
                
            # Calculations
            price_per_unit = base_price
            gross_sales = round(price_per_unit * qty, 2)
            net_sales = round(gross_sales * (1 - discount), 2)
            
            # Mathematical cost calculation based on product base margin
            # cost = base_price * (1 - margin)
            cost_per_unit = base_price * (1 - margin)
            total_cost = cost_per_unit * qty
            
            # Profit = Net Sales - Total Cost
            profit = round(net_sales - total_cost, 2)
            
            order_details.append((
                detail_id_counter,
                order_id,
                prod_id,
                net_sales,
                qty,
                discount,
                profit
            ))
            detail_id_counter += 1
            
    return orders, order_details, locations_list

# --- Seeding the Database and writing CSVs ---

def seed_sqlite(customers, products, orders, order_details, locations_list, db_path):
    # Remove existing database if it exists
    if os.path.exists(db_path):
        os.remove(db_path)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Create Tables (Normalized DDL)
    cursor.execute("""
    CREATE TABLE customers (
        customer_id TEXT PRIMARY KEY,
        customer_name TEXT,
        segment TEXT
    )""")
    
    cursor.execute("""
    CREATE TABLE products (
        product_id TEXT PRIMARY KEY,
        product_name TEXT,
        category TEXT,
        sub_category TEXT,
        base_price REAL,
        base_margin REAL
    )""")
    
    cursor.execute("""
    CREATE TABLE locations (
        postal_code TEXT PRIMARY KEY,
        city TEXT,
        state TEXT,
        region TEXT,
        country TEXT DEFAULT 'United States'
    )""")
    
    cursor.execute("""
    CREATE TABLE orders (
        order_id TEXT PRIMARY KEY,
        customer_id TEXT,
        order_date TEXT,
        ship_date TEXT,
        ship_mode TEXT,
        postal_code TEXT,
        FOREIGN KEY(customer_id) REFERENCES customers(customer_id),
        FOREIGN KEY(postal_code) REFERENCES locations(postal_code)
    )""")
    
    cursor.execute("""
    CREATE TABLE order_details (
        order_detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT,
        product_id TEXT,
        sales REAL,
        quantity INTEGER,
        discount REAL,
        profit REAL,
        FOREIGN KEY(order_id) REFERENCES orders(order_id),
        FOREIGN KEY(product_id) REFERENCES products(product_id)
    )""")
    
    # 2. Insert Data
    cursor.executemany("INSERT INTO customers VALUES (?, ?, ?)", customers)
    
    cursor.executemany("INSERT INTO products VALUES (?, ?, ?, ?, ?, ?)", products)
    
    # Filter duplicate postal codes for locations table
    unique_locations = {}
    for zip_code, city, state, region in locations_list:
        if zip_code not in unique_locations:
            unique_locations[zip_code] = (zip_code, city, state, region, 'United States')
    cursor.executemany("INSERT INTO locations VALUES (?, ?, ?, ?, ?)", list(unique_locations.values()))
    
    cursor.executemany("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?)", orders)
    
    cursor.executemany("INSERT INTO order_details (order_detail_id, order_id, product_id, sales, quantity, discount, profit) VALUES (?, ?, ?, ?, ?, ?, ?)", order_details)
    
    conn.commit()
    conn.close()
    print(f"Database successfully created and seeded at: {db_path}")

def export_flat_csv(customers, products, orders, order_details, locations_list, csv_path):
    # Maps for joining in memory
    cust_map = {c[0]: (c[1], c[2]) for c in customers}
    prod_map = {p[0]: (p[1], p[2], p[3]) for p in products}
    loc_map = {}
    for zip_code, city, state, region in locations_list:
        loc_map[zip_code] = (city, state, region)
        
    orders_map = {o[0]: (o[1], o[2], o[3], o[4], o[5]) for o in orders}
    
    headers = [
        "Row ID", "Order ID", "Order Date", "Ship Date", "Ship Mode",
        "Customer ID", "Customer Name", "Segment", 
        "Country", "City", "State", "Postal Code", "Region",
        "Product ID", "Category", "Sub-Category", "Product Name",
        "Sales", "Quantity", "Discount", "Profit"
    ]
    
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for od in order_details:
            detail_id, order_id, prod_id, sales, qty, discount, profit = od
            
            # Lookup linked details
            cust_id, order_date, ship_date, ship_mode, postal_code = orders_map[order_id]
            cust_name, segment = cust_map[cust_id]
            city, state, region = loc_map[postal_code]
            prod_name, category, subcat = prod_map[prod_id]
            
            writer.writerow([
                detail_id, order_id, order_date, ship_date, ship_mode,
                cust_id, cust_name, segment,
                "United States", city, state, postal_code, region,
                prod_id, category, subcat, prod_name,
                sales, qty, discount, profit
            ])
            
    print(f"Flat CSV dataset successfully created at: {csv_path}")

# --- Main Execution ---

if __name__ == "__main__":
    # Setup directories
    os.makedirs("data", exist_ok=True)
    
    db_file = os.path.join("data", "superstore.db")
    csv_file = os.path.join("data", "superstore_flat.csv")
    
    print("Generating data...")
    cust = generate_customers(800)
    prods = generate_products()
    ords, details, locs = generate_transactions(cust, prods, 5000)
    
    print("Seeding SQLite relational database...")
    seed_sqlite(cust, prods, ords, details, locs, db_file)
    
    print("Creating flat CSV database...")
    export_flat_csv(cust, prods, ords, details, locs, csv_file)
    
    print("\nData Generation Summary:")
    print(f"- Customers: {len(cust)}")
    print(f"- Products: {len(prods)}")
    print(f"- Orders: {len(ords)}")
    print(f"- Transaction Lines: {len(details)}")
    print("Done!")
