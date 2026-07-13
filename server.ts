import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialize Gemini API to prevent crash if key is missing
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not set. AI advisory will run in mock mode.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Simulated Knowledge Base / RAG Content (RBI Circulars, Indian Tax Rules for FY 2026-27, Investment Guidelines)
const KNOWLEDGE_BASE = {
  tax_rules: `
    --- INDIAN INCOME TAX SLABS (FY 2026-27 - New Tax Regime) ---
    - Income up to ₹4,00,000: Nil (0%)
    - ₹4,00,001 to ₹8,00,000: 5%
    - ₹8,00,001 to ₹12,00,000: 10%
    - ₹12,00,001 to ₹16,00,000: 15%
    - ₹16,00,001 to ₹20,00,000: 20%
    - Above ₹20,00,000: 30%
    - Standard Deduction is raised to ₹75,000 in the New Tax Regime.
    - Tax rebate under Section 87A is available for taxable income up to ₹7,00,000 (effectively zero tax up to ₹7.75 Lakhs with standard deduction).
    - Long-Term Capital Gains (LTCG) on Equity/Equity Mutual Funds: Taxed at 12.5% for gains exceeding ₹1.5 Lakhs in a financial year.
    - Short-Term Capital Gains (STCG) on Equity: Taxed at 20%.
  `,
  rbi_guidelines: `
    --- RBI MASTER DIRECTIONS ON DIGITAL WEALTH & PORTFOLIO ADVISORY ---
    - RBI/2025-26/98: Banks offering digital wealth management must enforce absolute data separation.
    - Cybersecurity Framework: MFA (Multi-Factor Authentication) required for all transaction execution.
    - Account Aggregator (AA) Framework: Real-time consent-based data aggregation from multiple financial entities (FIPs) via secure APIs.
    - Customer Protection: Digital advisors must display complete risk disclosures (high/medium/low risk) before order placement.
    - Fractional Investing: Investing in debt instruments, gold, and corporate papers is allowed with transparent NAV declaration.
  `,
  investment_products: `
    --- AURUM BANK HIGH-PERFORMANCE WEALTH PRODUCTS ---
    1. Aurum Bluechip Growth Fund (Large Cap Equity MF)
       - Risk: Moderate-High | Historical 3Yr Return: 15.4% p.a.
       - Focus: Top 100 Indian companies. Ideal for long-term compounding.
    2. Aurum Active Tactical Fund (Mid-Small Cap MF)
       - Risk: Very High | Historical 3Yr Return: 22.8% p.a.
       - Focus: High-growth enterprises. Highly responsive to momentum.
    3. Aurum Sovereign Gold Bonds (SGB / Digital Gold)
       - Risk: Low | Historical Return: 8-11% + 2.5% annual interest.
       - Focus: Sovereign backed gold. Tax-free maturity.
    4. Aurum Liquid Reserve (Debt Liquid Fund)
       - Risk: Minimal | Historical Return: 6.8% p.a.
       - Focus: Corporate commercial papers and Treasury bills. Instant redemption.
    5. Aurum Green Infrastructure Fund (Thematic ESG MF)
       - Risk: High | Historical 1Yr Return: 18.2%
       - Focus: Sustainable energy, solar power, EV grid infrastructure.
  `
};

// 1. Account Aggregator & Core Banking API Simulation
let userProfile = {
  userId: "user_aurum_101",
  name: "Aditya Sharma",
  age: 32,
  occupation: "Senior Software Engineer",
  riskAppetite: "Aggressive", // Conservative, Balanced, Aggressive
  monthlyIncome: 180000,
  monthlyExpenses: 65000,
  financialGoals: [
    { id: "g1", title: "Retirement Corpus", targetAmount: 50000000, currentAmount: 850000, deadline: 2049 },
    { id: "g2", title: "Buy Luxury EV", targetAmount: 4000000, currentAmount: 1200000, deadline: 2028 },
    { id: "g3", title: "Tax Optimization", targetAmount: 200000, currentAmount: 50000, deadline: 2027 }
  ],
  connectedAccounts: [
    { bank: "Aurum Core Bank", accountNo: "...9842", type: "Savings", balance: 245000 },
    { bank: "State Bank of India (AA Linked)", accountNo: "...4110", type: "Savings", balance: 112000 },
    { bank: "HDFC Credit Card (AA Linked)", accountNo: "...1089", type: "Credit Card", limit: 300000, dueAmount: 38400 }
  ]
};

let userPortfolio = [
  { id: "p1", name: "Aurum Bluechip Growth Fund", type: "Mutual Fund", assetClass: "Equity", investedAmount: 350000, currentVal: 412000, units: 182.5, currentNav: 2257.5, dayChange: 1.2 },
  { id: "p2", name: "Aurum Active Tactical Fund", type: "Mutual Fund", assetClass: "Equity", investedAmount: 200000, currentVal: 254000, units: 1450.2, currentNav: 175.1, dayChange: -0.4 },
  { id: "p3", name: "Reliance Industries Ltd", type: "Equity", assetClass: "Stock", investedAmount: 150000, currentVal: 168000, units: 60, currentNav: 2800.0, dayChange: 2.1 },
  { id: "p4", name: "Aurum Sovereign Gold Bonds", type: "Sovereign Bond", assetClass: "Gold", investedAmount: 100000, currentVal: 118000, units: 20, currentNav: 5900.0, dayChange: 0.5 },
  { id: "p5", name: "Fixed Deposit (Aurum Bank)", type: "Fixed Income", assetClass: "Debt", investedAmount: 500000, currentVal: 500000, rate: "7.25% p.a.", maturityDate: "2027-12-15", dayChange: 0.0 }
];

let transactionHistory = [
  { id: "t1", date: "2026-07-06", description: "SIP - Aurum Bluechip Growth", category: "Investment", amount: 15000, status: "Completed", account: "Aurum Savings" },
  { id: "t2", date: "2026-07-05", description: "Zomato Food Delivery", category: "Dining", amount: 1240, status: "Completed", account: "HDFC Card" },
  { id: "t3", date: "2026-07-04", description: "Salary Credit - Aurum Corp", category: "Salary", amount: 180000, status: "Completed", account: "Aurum Savings" },
  { id: "t4", date: "2026-07-02", description: "Rent Transfer", category: "Rent", amount: 35000, status: "Completed", account: "Aurum Savings" },
  { id: "t5", date: "2026-06-28", description: "Airtel Fiber Broadband", category: "Utilities", amount: 1179, status: "Completed", account: "Aurum Savings" },
  { id: "t6", date: "2026-06-25", description: "Apple India Online Store", category: "Shopping", amount: 79900, status: "Completed", account: "HDFC Card" }
];

let chatHistory: Array<{ role: "user" | "model"; text: string }> = [];

// API Endpoint to get complete financial status
app.get("/api/financials", (req, res) => {
  const netWorth = userProfile.connectedAccounts.reduce((acc, curr) => {
    return curr.type === "Credit Card" ? acc - curr.dueAmount : acc + curr.balance;
  }, 0) + userPortfolio.reduce((acc, curr) => acc + curr.currentVal, 0);

  res.json({
    profile: userProfile,
    portfolio: userPortfolio,
    transactions: transactionHistory,
    netWorth,
    knowledgeBase: KNOWLEDGE_BASE
  });
});

// API Endpoint to update financial twin profile
app.post("/api/profile/update", (req, res) => {
  const { riskAppetite, financialGoals, monthlyExpenses } = req.body;
  if (riskAppetite) userProfile.riskAppetite = riskAppetite;
  if (monthlyExpenses) userProfile.monthlyExpenses = Number(monthlyExpenses);
  if (financialGoals) userProfile.financialGoals = financialGoals;

  res.json({ success: true, profile: userProfile });
});

// API Endpoint to execute transactional advisory orders (Agentic AI - execution layer)
app.post("/api/transact", (req, res) => {
  const { productName, amount, type } = req.body; // type: 'INVEST' or 'REDEEM'
  
  if (!productName || !amount) {
    return res.status(400).json({ error: "Product name and amount are required." });
  }

  // Deduct from savings balance (Aurum Savings)
  const aurumAccount = userProfile.connectedAccounts.find(acc => acc.bank === "Aurum Core Bank");
  if (!aurumAccount) {
    return res.status(500).json({ error: "Aurum bank account not found." });
  }

  if (type === "INVEST") {
    if (aurumAccount.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance in Savings Account." });
    }
    aurumAccount.balance -= amount;

    // Check if product exists in portfolio, if so add, otherwise create
    const existingIndex = userPortfolio.findIndex(p => p.name.toLowerCase() === productName.toLowerCase());
    if (existingIndex !== -1) {
      userPortfolio[existingIndex].investedAmount += amount;
      userPortfolio[existingIndex].currentVal += amount;
      // Recalculate units based on current NAV
      const nav = userPortfolio[existingIndex].currentNav || 100;
      userPortfolio[existingIndex].units = Number((userPortfolio[existingIndex].currentVal / nav).toFixed(2));
    } else {
      userPortfolio.push({
        id: "p_" + Date.now(),
        name: productName,
        type: "Mutual Fund",
        assetClass: "Equity",
        investedAmount: amount,
        currentVal: amount,
        units: Number((amount / 150).toFixed(2)), // Mock navy of 150
        currentNav: 150,
        dayChange: 0.5
      });
    }

    // Add transaction log
    transactionHistory.unshift({
      id: "t_" + Date.now(),
      date: new Date().toISOString().split("T")[0],
      description: `Invested in ${productName}`,
      category: "Investment",
      amount: amount,
      status: "Completed",
      account: "Aurum Savings"
    });

  } else if (type === "REDEEM") {
    const existingIndex = userPortfolio.findIndex(p => p.name.toLowerCase() === productName.toLowerCase());
    if (existingIndex === -1 || userPortfolio[existingIndex].currentVal < amount) {
      return res.status(400).json({ error: "Insufficient portfolio valuation to redeem." });
    }

    userPortfolio[existingIndex].investedAmount -= amount;
    userPortfolio[existingIndex].currentVal -= amount;
    aurumAccount.balance += amount;

    if (userPortfolio[existingIndex].currentVal <= 0) {
      userPortfolio.splice(existingIndex, 1);
    }

    // Add transaction log
    transactionHistory.unshift({
      id: "t_" + Date.now(),
      date: new Date().toISOString().split("T")[0],
      description: `Redeemed ${productName}`,
      category: "Redemption",
      amount: amount,
      status: "Completed",
      account: "Aurum Savings"
    });
  }

  res.json({
    success: true,
    profile: userProfile,
    portfolio: userPortfolio,
    transactions: transactionHistory
  });
});

// API Endpoint to process AI Wealth Advisory (Agentic AI + RAG + Multi-turn Chat)
app.post("/api/advisory/chat", async (req, res) => {
  const { message, resetHistory } = req.body;

  if (resetHistory) {
    chatHistory = [];
  }

  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    const ai = getGeminiClient();

    // Compile dynamic Context for RAG
    const totalInvested = userPortfolio.reduce((acc, curr) => acc + curr.investedAmount, 0);
    const totalValuation = userPortfolio.reduce((acc, curr) => acc + curr.currentVal, 0);
    const savingsBalance = userProfile.connectedAccounts.reduce((acc, curr) => curr.type === "Savings" ? acc + curr.balance : acc, 0);
    const currentDebt = userProfile.connectedAccounts.reduce((acc, curr) => curr.type === "Credit Card" ? acc + curr.dueAmount : acc, 0);

    const systemInstruction = `
      You are "Aura", a highly trained, elite, interactive Wealth Advisory AI and Digital Financial Twin at Aurum Bank.
      You are built for a national-level hackathon. You must act as an autonomous agentic system, displaying extreme depth, security knowledge, and real financial capability.

      --- CUSTOMER DIGITAL TWIN PROFILE ---
      Customer Name: ${userProfile.name} (Age: ${userProfile.age})
      Occupation: ${userProfile.occupation}
      Risk Appetite: ${userProfile.riskAppetite}
      Monthly Income: ₹${userProfile.monthlyIncome}
      Monthly Fixed Expenses: ₹${userProfile.monthlyExpenses}
      Savings Cash Balance: ₹${savingsBalance}
      Total Active Investment: ₹${totalValuation} (Invested: ₹${totalInvested})
      Outstanding Credit Debt: ₹${currentDebt}
      Financial Goals: ${JSON.stringify(userProfile.financialGoals)}

      --- RBI REGULATIONS & INDIAN TAX CODE (RAG Grounding Source) ---
      ${KNOWLEDGE_BASE.tax_rules}
      ${KNOWLEDGE_BASE.rbi_guidelines}

      --- AURUM WEALTH INVESTMENT CATALOGUE ---
      ${KNOWLEDGE_BASE.investment_products}

      --- YOUR ADVISORY MANDATES & BEHAVIORAL PROTOCOLS ---
      1. Autonomous Leakage Detection & Advice: Proactively find financial issues (e.g. high spending, idle savings balance, credit card debt relative to income, and mismatch between Aggressive risk profile and debt investments).
      2. Citation of Grounding Sources: Whenever advising on taxes, cite specific sections (Section 80C, LTCG at 12.5%, STCG at 20%). When discussing banking/security, cite RBI Master Directions or Account Aggregator compliance.
      3. Precise Wealth Recommendation: Provide actual structured asset allocation percentages (e.g. 60% Equity, 20% Gold, 20% Debt). Refer specifically to "Aurum Bluechip Growth Fund", "Aurum Active Tactical Fund", "Aurum Sovereign Gold Bonds", etc.
      4. Actionable Action Plan: Format advice with a clear, step-by-step financial roadmap.
      5. Multi-lingual Support: If the user communicates in Hindi, Spanish, Tamil, etc., or requests a specific language, switch your language beautifully while preserving structural and financial precision.
      6. Investment Actions: You can pitch the Aurum products. Encourage the customer to click "Quick Invest" on the sidebar cards if they wish to execute transactions instantly.
      
      Always speak directly, elegantly, and with a tone of an elite global private wealth manager. Avoid technical jargon without explaining it. Be encouraging and clear.
    `;

    // Format chat history for @google/genai SDK
    // SDK expects format: contents: [{ role: 'user', parts: [{ text: '...' }] }]
    const formattedContents = chatHistory.map(h => ({
      role: h.role === "model" ? "model" as const : "user" as const,
      parts: [{ text: h.text }]
    }));

    // Add current message
    formattedContents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedContents,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    const reply = response.text || "I am analyzing your portfolio and will respond shortly.";
    
    // Save to server-side history
    chatHistory.push({ role: "user", text: message });
    chatHistory.push({ role: "model", text: reply });

    res.json({ reply });

  } catch (error) {
    console.error("Gemini API Error in backend:", error);
    res.status(500).json({ 
      error: "Error processing wealth advisory", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// API Endpoint to check state of Gemini API integration (health check)
app.get("/api/advisory/status", (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  res.json({
    status: "active",
    aiEnabled: !!apiKey,
    modelUsed: "gemini-3.5-flash"
  });
});

// Configure Vite or Static Asset Serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Aura Full-Stack Engine] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
