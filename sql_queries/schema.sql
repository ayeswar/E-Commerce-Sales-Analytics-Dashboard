-- E-Commerce Sales Analytics Database Schema (DDL)
-- Database: PostgreSQL / MySQL / SQLite compatible

-- 1. Table: Customers
CREATE TABLE customers (
    customer_id VARCHAR(20) PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    segment VARCHAR(50) NOT NULL
);

-- 2. Table: Locations
CREATE TABLE locations (
    postal_code VARCHAR(20) PRIMARY KEY,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    region VARCHAR(50) NOT NULL,
    country VARCHAR(50) DEFAULT 'United States'
);

-- 3. Table: Products
CREATE TABLE products (
    product_id VARCHAR(50) PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    sub_category VARCHAR(100) NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL,
    base_margin DECIMAL(5, 4) NOT NULL
);

-- 4. Table: Orders
CREATE TABLE orders (
    order_id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(20) NOT NULL,
    order_date DATE NOT NULL,
    ship_date DATE NOT NULL,
    ship_mode VARCHAR(50) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    FOREIGN KEY (postal_code) REFERENCES locations(postal_code)
);

-- 5. Table: Order Details (Line Items)
CREATE TABLE order_details (
    order_detail_id INTEGER PRIMARY KEY AUTOINCREMENT, -- SERIAL/AUTO_INCREMENT in Postgres/MySQL
    order_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    sales DECIMAL(10, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    discount DECIMAL(4, 2) DEFAULT 0.0,
    profit DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Indexing for performance optimization (Recommended for large datasets)
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_postal_code ON orders(postal_code);
CREATE INDEX idx_order_details_order_id ON order_details(order_id);
CREATE INDEX idx_order_details_product_id ON order_details(product_id);
