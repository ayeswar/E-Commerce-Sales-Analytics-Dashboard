# Tableau Advanced Implementation Guide: E-Commerce Sales Analytics

This guide provides step-by-step instructions and calculations to build the **E-Commerce Sales Analytics Dashboard** in Tableau, utilizing advanced features including **Level of Detail (LOD) Expressions, Parameters, Interactive Actions, Filters, and Forecasting**.

---

## 1. Data Connection & Preparation
1. Open Tableau Desktop.
2. Select **Connect** -> **Text File** and load `superstore_flat.csv`.
3. Verify that the data types are correctly inferred:
   - Geographic fields: `Country` (Country), `State` (State/Province), `City` (City), `Postal Code` (Postal Code).
   - Date fields: `Order Date` (Date), `Ship Date` (Date).
   - Measure fields: `Sales`, `Quantity`, `Discount`, `Profit` (Decimal numbers).

---

## 2. Level of Detail (LOD) Expressions
LOD expressions allow you to calculate values at a specific level of detail, escaping the visual layout constraints. Create the following **Calculated Fields**:

### A. Customer Acquisition Date (First Purchase Cohort)
To group customers by the month they made their very first purchase.
* **Name**: `Customer Acquisition Date`
* **Formula**:
  ```tableau
  { FIXED [Customer ID] : MIN([Order Date]) }
  ```
* *Usage*: Create a new field `Cohort Month` using `DATETRUNC('month', [Customer Acquisition Date])` to perform Cohort Analysis.

### B. Customer Lifetime Value (CLV)
To calculate the total historical spend for each customer across all orders.
* **Name**: `Customer Lifetime Value`
* **Formula**:
  ```tableau
  { FIXED [Customer ID] : SUM([Sales]) }
  ```

### C. Average Order Value (AOV)
To find the average order value across the database (avoiding row-level division errors).
* **Name**: `Average Order Value (AOV)`
* **Formula**:
  ```tableau
  SUM([Sales]) / COUNTD([Order ID])
  ```

### D. Purchase Frequency per Customer
To count how many unique orders each customer has placed.
* **Name**: `Customer Purchase Frequency`
* **Formula**:
  ```tableau
  { FIXED [Customer ID] : COUNTD([Order ID]) }
  ```

---

## 3. Creating Parameters for Interactive Analytics
Parameters allow users to dynamically adjust thresholds and scenarios on the dashboard.

### Parameter A: Discount Threshold Slider
Use this parameter to highlight transactions where discounts exceed a certain level and are causing profit erosion.
1. Right-click in the Data pane and select **Create Parameter**.
2. **Name**: `Discount Threshold`
3. **Data Type**: Float
4. **Current Value**: `0.20` (representing 20%)
5. **Display Format**: Percentage (`0%`)
6. **Allowable Values**: Range
   - **Minimum**: `0.0`
   - **Maximum**: `0.8`
   - **Step Size**: `0.05`

Now, create a **Calculated Field** to leverage this parameter:
* **Name**: `High-Risk Discount Status`
* **Formula**:
  ```tableau
  IF [Discount] >= [Discount Threshold] THEN
      IF [Profit] < 0 THEN "High-Risk Loss Maker"
      ELSE "High-Risk Margin Squeezer"
      END
  ELSE
      IF [Profit] < 0 THEN "Other Loss Maker"
      ELSE "Profitable Order"
      END
  END
  ```
* *Usage*: Drag this calculated field onto the **Color** shelf in a scatter plot of `Discount` vs. `Profit` to visually demonstrate how the threshold cuts off profitable orders.

---

## 4. Advanced Dashboards & Visualization Setup

### Sheet 1: Monthly Sales Trend & Forecast
1. Drag `Order Date` (as a continuous month, e.g., `Month Year`) to **Columns**.
2. Drag `Sales` to **Rows**.
3. Go to the **Analytics** pane on the left.
4. Drag **Forecast** onto the canvas.
5. Right-click on the forecast area, select **Forecast Options**:
   - Set **Forecast Length** to exactly `6 Months`.
   - Set **Source Data** to aggregate by `Months`.
   - Under **Forecast Model**, select **Custom** -> **Additive Trend, Multiplicative Seasonality** (to match the retail cycle).

### Sheet 2: State-Wise Sales Map
1. Double-click `State` in the Data pane. Tableau will automatically generate a geographic map.
2. Drag `Sales` to the **Color** card.
3. Drag `Profit` to the **Tooltip** card.
4. Change the mark type from **Automatic** to **Map** (Filled Map).
5. Edit Colors: Choose the **Red-Green Diverging** or a custom **Purple-Gold** palette. Set the center to `0` so negative profit states immediately stand out in red/gold.

### Sheet 3: Profitability vs. Discount (Scatter Plot)
1. Drag `Discount` to **Columns** (set as Dimension, not Aggregate).
2. Drag `Profit` to **Rows** (set as Dimension, not Aggregate).
3. Drag `Sales` (as size) and `Order ID` (to detail) to show individual order line items.
4. Drag the calculated field `[High-Risk Discount Status]` onto **Color**.
5. Show the `[Discount Threshold]` Parameter Control on the right. Slide the parameter to watch the color categories dynamically re-classify.

### Sheet 4: Customer RFM Segmentation Matrix
We can rebuild the RFM model in Tableau using LODs and percentiles:
1. Create `Recency Days`:
   ```tableau
   DATEDIFF('day', { FIXED [Customer ID] : MAX([Order Date]) }, { MAX([Order Date]) })
   ```
2. Create `Frequency (Orders)` using the `[Customer Purchase Frequency]` LOD.
3. Create `Monetary (Spend)` using the `[Customer Lifetime Value]` LOD.
4. Assign quintile scores using Tableau's `RANK_PERCENTILE` function, or create simple bins (e.g., `IF [Customer Purchase Frequency] > 8 THEN 5 ...`).
5. Map these to segments and build a **Treemap** visualization by dragging `Segment` to **Text/Color** and `Customer Lifetime Value` to **Size**.

---

## 5. Dashboard Actions (Interactivity)
To make the dashboard feel alive, we will set up **Filter Actions** so that selecting an element in one chart filters the rest of the dashboard.

1. Go to the top menu and select **Dashboard** -> **Actions...**
2. Click **Add Action** -> **Filter**.
3. **Name**: `Filter by State (Geographic Action)`
4. **Source Sheets**: Select the **State-Wise Sales Map** worksheet.
5. **Run Action on**: Select **Select** (clicking on a state triggers the action).
6. **Target Sheets**: Select all other sheets (Trend, Scatter Plot, Top Products, RFM).
7. **Clearing the Selection**: Select **Show all values** (reverts the dashboard to national metrics when unclicked).

Repeat this process to add:
* A **Category Drill-Down Action**: Clicking a Category in the Bar Chart filters the Sub-Category chart.
* A **Customer Segment Action**: Clicking an RFM Segment in the Treemap filters the customer leaderboard below it.
