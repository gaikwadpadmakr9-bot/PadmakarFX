/**
 * PadmakarFX Backend Server
 * Affiliate Hub + SaaS Analytics Platform
 * Zero-Cost Monetization Engine
 */

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());

// ==================== DATABASE CONNECTION ====================
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/padmakarfx', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✓ MongoDB Connected');
    } catch (error) {
        console.error('✗ MongoDB Connection Failed:', error);
        process.exit(1);
    }
};

connectDB();

// ==================== DATABASE SCHEMAS ====================

// User Schema
const userSchema = new mongoose.Schema({
    _id: String,
    name: String,
    email: { type: String, unique: true, lowercase: true },
    password: String,
    preferredBroker: String,
    affiliateLink: String,
    commissionEarned: { type: Number, default: 0 },
    totalTrades: { type: Number, default: 0 },
    totalLots: { type: Number, default: 0 },
    accountBalance: { type: Number, default: 0 },
    emailVerified: { type: Boolean, default: false },
    verificationToken: String,
    role: { type: String, enum: ['user', 'premium', 'enterprise'], default: 'user' },
    premiumUntil: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// Trade Record Schema
const tradeSchema = new mongoose.Schema({
    userId: String,
    symbol: String,
    type: { type: String, enum: ['BUY', 'SELL'] },
    lots: Number,
    entryPrice: Number,
    exitPrice: Number,
    profit: Number,
    brokerCommission: Number,
    affiliateCommission: Number,
    createdAt: { type: Date, default: Date.now },
});

// Affiliate Commission Schema
const commissionSchema = new mongoose.Schema({
    userId: String,
    referredUserId: String,
    brokerName: String,
    lotsTraded: Number,
    commissionPerLot: Number,
    totalCommission: Number,
    status: { type: String, enum: ['pending', 'confirmed', 'paid'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    paidAt: Date,
});

// Broker Integration Schema
const brokerSchema = new mongoose.Schema({
    userId: String,
    brokerName: String,
    brokerAccountNumber: String,
    apiKey: String, // Encrypted
    apiSecret: String, // Encrypted
    connected: { type: Boolean, default: false },
    connectedAt: Date,
    lastSyncAt: Date,
});

const User = mongoose.model('User', userSchema);
const Trade = mongoose.model('Trade', tradeSchema);
const Commission = mongoose.model('Commission', commissionSchema);
const BrokerIntegration = mongoose.model('BrokerIntegration', brokerSchema);

// ==================== EMAIL SERVICE ====================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

const sendVerificationEmail = async (email, verificationToken) => {
    const verificationLink = `${process.env.FRONTEND_URL}/verify?token=${verificationToken}`;
    
    await transporter.sendMail({
        from: 'noreply@padmakarfx.com',
        to: email,
        subject: 'Verify Your PadmakarFX Account',
        html: `
            <h2>Welcome to PadmakarFX!</h2>
            <p>Click the link below to verify your email:</p>
            <a href="${verificationLink}" style="background-color: #007AFF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
            <p>If you didn't create this account, ignore this email.</p>
        `,
    });
};

const sendAffiliateAlert = async (email, commission, broker) => {
    await transporter.sendMail({
        from: 'noreply@padmakarfx.com',
        to: email,
        subject: `💰 New Commission Earned: $${commission}`,
        html: `
            <h2>New Commission Recorded!</h2>
            <p>A trade was executed through your ${broker} referral link.</p>
            <p><strong>Commission Earned: $${commission}</strong></p>
            <p>Log in to your dashboard to see all your earnings.</p>
        `,
    });
};

// ==================== AUTHENTICATION ROUTES ====================

// Sign Up
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password, preferredBroker } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const verificationToken = uuidv4();
        const affiliateLink = `${process.env.FRONTEND_URL}?ref=${userId}`;

        // Create user
        const user = new User({
            _id: userId,
            name,
            email,
            password: hashedPassword,
            preferredBroker,
            affiliateLink,
            verificationToken,
        });

        await user.save();

        // Send verification email
        await sendVerificationEmail(email, verificationToken);

        res.status(201).json({
            success: true,
            message: 'Account created. Check your email to verify.',
            userId,
        });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ error: 'Signup failed' });
    }
});

// Email Verification
app.get('/api/auth/verify', async (req, res) => {
    try {
        const { token } = req.query;

        const user = await User.findOne({ verificationToken: token });
        if (!user) {
            return res.status(400).json({ error: 'Invalid token' });
        }

        user.emailVerified = true;
        user.verificationToken = null;
        await user.save();

        res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                commissionEarned: user.commissionEarned,
                affiliateLink: user.affiliateLink,
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// ==================== USER PROFILE ROUTES ====================

// Get User Profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            commissionEarned: user.commissionEarned,
            totalTrades: user.totalTrades,
            totalLots: user.totalLots,
            accountBalance: user.accountBalance,
            affiliateLink: user.affiliateLink,
            premiumUntil: user.premiumUntil,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// ==================== AFFILIATE TRACKING ====================

// Track Trade & Commission
app.post('/api/affiliate/track-trade', async (req, res) => {
    try {
        const { userId, symbol, type, lots, entryPrice, exitPrice, brokerName } = req.body;

        // Calculate profit
        const profit = type === 'BUY'
            ? (exitPrice - entryPrice) * lots * 100
            : (entryPrice - exitPrice) * lots * 100;

        // Affiliate commission (example: $8 per lot for IC Markets)
        const commissionPerLot = {
            'IC Markets': 10,
            'Pepperstone': 8,
            'AvaTrade': 5,
            'ThinkMarkets': 7,
        }[brokerName] || 5;

        const affiliateCommission = lots * commissionPerLot;

        // Save trade
        const trade = new Trade({
            userId,
            symbol,
            type,
            lots,
            entryPrice,
            exitPrice,
            profit,
            affiliateCommission,
        });

        await trade.save();

        // Update user commission
        const user = await User.findById(userId);
        user.commissionEarned += affiliateCommission;
        user.totalTrades += 1;
        user.totalLots += lots;
        await user.save();

        // Send alert email
        await sendAffiliateAlert(user.email, affiliateCommission, brokerName);

        res.json({
            success: true,
            commission: affiliateCommission,
            totalCommission: user.commissionEarned,
        });
    } catch (error) {
        console.error('Trade Tracking Error:', error);
        res.status(500).json({ error: 'Failed to track trade' });
    }
});

// Get Commission History
app.get('/api/affiliate/commissions', authenticateToken, async (req, res) => {
    try {
        const commissions = await Commission.find({ userId: req.userId }).sort({ createdAt: -1 });
        const totalEarned = commissions.reduce((sum, c) => sum + c.totalCommission, 0);

        res.json({
            commissions,
            totalEarned,
            pendingCount: commissions.filter(c => c.status === 'pending').length,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch commissions' });
    }
});

// ==================== BROKER INTEGRATION ====================

// Connect Broker Account
app.post('/api/broker/connect', authenticateToken, async (req, res) => {
    try {
        const { brokerName, accountNumber, apiKey, apiSecret } = req.body;

        // In production, encrypt apiKey and apiSecret
        const brokerIntegration = new BrokerIntegration({
            userId: req.userId,
            brokerName,
            brokerAccountNumber: accountNumber,
            apiKey: apiKey, // Should be encrypted
            apiSecret: apiSecret, // Should be encrypted
            connected: true,
            connectedAt: new Date(),
        });

        await brokerIntegration.save();

        res.json({
            success: true,
            message: `${brokerName} account connected`,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to connect broker' });
    }
});

// Get Connected Brokers
app.get('/api/broker/connected', authenticateToken, async (req, res) => {
    try {
        const brokers = await BrokerIntegration.find({ userId: req.userId });
        res.json(brokers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch brokers' });
    }
});

// ==================== PREMIUM SUBSCRIPTION ====================

// Upgrade to Premium
app.post('/api/subscription/upgrade', authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body; // 'monthly' or 'yearly'
        const premiumDuration = plan === 'yearly' ? 365 : 30;
        const premiumUntil = new Date(Date.now() + premiumDuration * 24 * 60 * 60 * 1000);

        const user = await User.findById(req.userId);
        user.role = 'premium';
        user.premiumUntil = premiumUntil;
        await user.save();

        res.json({
            success: true,
            message: 'Upgraded to premium',
            premiumUntil,
        });
    } catch (error) {
        res.status(500).json({ error: 'Upgrade failed' });
    }
});

// ==================== ANALYTICS ====================

// Get Dashboard Stats
app.get('/api/analytics/dashboard', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        const trades = await Trade.find({ userId: req.userId });
        const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
        const winRate = trades.length > 0
            ? ((trades.filter(t => t.profit > 0).length / trades.length) * 100).toFixed(2)
            : 0;

        res.json({
            totalCommission: user.commissionEarned,
            totalTrades: user.totalTrades,
            totalLots: user.totalLots,
            totalProfit,
            winRate,
            accountStatus: user.role,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// ==================== MIDDLEWARE ====================

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.userId = decoded.userId;
        next();
    });
}

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✓ PadmakarFX Server running on port ${PORT}`);
});
