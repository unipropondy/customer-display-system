require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { sql, poolPromise, getPool } = require("./db");

const app = express();

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());

console.log("ENV CHECK 👉", process.env.DB_SERVER);

// ================= DYNAMIC DB MIDDLEWARE =================
app.use(async (req, res, next) => {
  try {
    const dbName = req.headers["x-db-name"] || process.env.DB_NAME;

    if (!dbName) {
      return res.status(400).json({ success: false, message: "Database name required" });
    }

    req.pool = await getPool(dbName);
    next();
  } catch (err) {
    console.error("❌ DB Middleware Error:", err);
    res.status(500).json({ success: false, message: "Database connection failed", error: err.message });
  }
});
app.get("/", (req, res) => {
  res.status(200).send("API Running 🚀");
});

// ================= LOGIN =================
app.post("/api/login", async (req, res) => {
  try {
    let { username, password } = req.body;

    // ✅ Validation
    username = username?.trim();
    password = password?.trim();

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and Password are required"
      });
    }

    const pool = req.pool;

    const result = await pool.request()
      .input("UserName", sql.VarChar(100), username)
      .query(`
        SELECT 
          UserCode,
          UserGroupCode,
          UserName,
          Password,
          ExpiryDate,
          Designation,
          Email,
          Phone
        FROM tblUserMaster
        WHERE LTRIM(RTRIM(UserName)) = @UserName
      `);

    // ❌ User not found
    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    const user = result.recordset[0];

    const dbUsername = user.UserName?.trim();
    const dbPassword = user.Password?.trim();

    // ❌ Invalid credentials
    if (
      dbUsername.toLowerCase() !== username.toLowerCase() ||
      dbPassword !== password
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password"
      });
    }

    // ❌ Expiry check
    if (
      user.ExpiryDate &&
      new Date(user.ExpiryDate) < new Date()
    ) {
      return res.status(403).json({
        success: false,
        message: "Account expired"
      });
    }

    // ✅ Success
    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        userCode: user.UserCode,
        userGroupCode: user.UserGroupCode?.trim(),
        userName: dbUsername,
        designation: user.Designation?.trim(),
        email: user.Email?.trim(),
        phone: user.Phone?.trim()
      }
    });

  } catch (err) {
    console.error("🔥 LOGIN ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

// ================= KDS TODAY =================
app.get("/kds-today", async (req, res) => {
  try {
    const pool = req.pool;

    const result = await pool.request().query(`
      SELECT 
        o.OrderId,
        o.OrderNumber,
        o.Tableno,
        o.OrderDateTime,
        o.IsTakeAway,

        d.OrderDetailId,
        d.DishName,
        d.Quantity,
        d.ModifierDescription,
        d.Remarks,
        d.isReady,
        d.isDelivered

      FROM RestaurantOrderCur o
      INNER JOIN RestaurantOrderDetailCur d
        ON o.OrderId = d.OrderId

      WHERE 
        ISNULL(d.isReady, 0) = 0
        AND CAST(o.OrderDateTime AS DATE) = CAST(GETDATE() AS DATE)

      ORDER BY o.OrderDateTime ASC
    `);

    return res.status(200).json({
      success: true,
      data: result.recordset
    });

  } catch (err) {
    console.error("🔥 KDS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
});

// ================= MARK READY =================
app.post("/mark-ready", async (req, res) => {
  try {
    const { orderId } = req.body;

    // ✅ Validation
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required"
      });
    }

    const pool = req.pool;

    const result = await pool.request()
      .input("orderId", sql.UniqueIdentifier, orderId)
      .query(`
        UPDATE RestaurantOrderDetailCur
        SET isReady = 1
        WHERE OrderId = @orderId
      `);

    return res.status(200).json({
      success: true,
      message: "Order marked as ready",
      rowsAffected: result.rowsAffected[0]
    });

  } catch (err) {
    console.error("🔥 MARK READY ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Database update failed",
      error: err.message
    });
  }
});

// ================= CDS TODAY =================
// app.get("/cds-today", async (req, res) => {
//   try {
//     const pool = req.pool;

//     const result = await pool.request().query(`
//       SELECT 
//         o.OrderId,
//         o.OrderNumber,
//         o.Tableno,
//         o.OrderDateTime,
//         CASE 
//           WHEN MIN(CAST(ISNULL(d.isReady, 0) AS INT)) = 1 THEN 'READY'
//           ELSE 'PREPARING'
//         END as StatusLabel
//       FROM RestaurantOrderCur o
//       INNER JOIN RestaurantOrderDetailCur d 
//         ON o.OrderId = d.OrderId
//       WHERE 
//         d.isDelivered = 0
//         --AND CAST(o.OrderDateTime AS DATE) = CAST(GETDATE() AS DATE)
//       GROUP BY 
//         o.OrderId, o.OrderNumber, o.Tableno, o.OrderDateTime
//       ORDER BY o.OrderDateTime ASC
//     `);

//     return res.status(200).json({
//       success: true,
//       data: result.recordset
//     });

//   } catch (err) {
//     console.error("🔥 CDS ERROR:", err);

//     return res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: err.message
//     });
//   }
// });

app.get("/cds-today", async (req, res) => {
  try {

    const pool = req.pool;

    const result = await pool.request().query(`
      SELECT 
        o.OrderId,
        o.OrderNumber,
        o.Tableno,
        o.OrderDateTime,

        CASE 
          WHEN MIN(CAST(ISNULL(d.isReady, 0) AS INT)) = 1 
          THEN 'READY'
          ELSE 'PREPARING'
        END AS StatusLabel

      FROM RestaurantOrderCur o
      INNER JOIN RestaurantOrderDetailCur d 
         ON o.OrderId = d.OrderId
      WHERE ISNULL(d.isDelivered, 0) = 0
      --AND CAST(o.OrderDateTime AS DATE) = CAST(GETDATE() AS DATE)
      GROUP BY 
        o.OrderId,
        o.OrderNumber,
        o.Tableno,
        o.OrderDateTime

      ORDER BY o.OrderDateTime ASC
    `);

    res.json(result.recordset);

  } catch (err) {

    console.error("🔥 CDS ERROR:", err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ================= 404 =================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

// ================= PORT =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});