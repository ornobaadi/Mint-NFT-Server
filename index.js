const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const helmet = require('helmet');
const winston = require('winston');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const app = express();
const port = 5000;
require('dotenv').config();

// Setup Winston logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// Swagger configuration
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'NFT API',
            version: '1.0.0',
            description: 'API for NFT minting and management',
        },
        servers: [
            {
                url: 'http://localhost:5000',
                description: 'Development server',
            },
        ],
    },
    apis: ['./index.js'], // path to your API routes file
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);

// MongoDB Atlas Connection URL - ensure you have these in your .env file
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xd8rz.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const dbName = process.env.DB_NAME || 'nft-database';

// Create a MongoClient with options
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db;

// Connect to MongoDB Atlas with retry logic
async function connectToMongo(retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            await client.connect();
            await client.db("admin").command({ ping: 1 });
            logger.info("Connected successfully to MongoDB Atlas!");
            db = client.db(dbName);
            return true;
        } catch (error) {
            logger.error(`MongoDB connection attempt ${i + 1} failed:`, error);
            if (i === retries - 1) {
                throw error;
            }
            // Wait for 5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return false;
}

// Middleware
app.use(cors({
    origin: ['http://localhost:3000'], // Add your frontend URL
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));
app.use(express.json());
app.use(helmet());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Health check endpoint
/**
 * @swagger
 * /:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the status of the API and database connection
 *     responses:
 *       200:
 *         description: API is running successfully
 */
app.get('/', (req, res) => {
    res.json({
        status: 'success',
        message: 'NFT API is running',
        database: db ? 'connected' : 'disconnected'
    });
});

// Database connection check middleware
app.use((req, res, next) => {
    if (!db) {
        return res.status(500).json({
            status: 'error',
            message: 'Database connection not established'
        });
    }
    next();
});

/**
 * @swagger
 * /api/nft/store:
 *   post:
 *     summary: Store NFT data
 *     description: Stores the provided NFT data in the database
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nftId
 *               - name
 *               - description
 *               - logoUrl
 *               - userWalletAddress
 *             properties:
 *               nftId:
 *                 type: number
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *               userWalletAddress:
 *                 type: string
 *     responses:
 *       201:
 *         description: NFT data stored successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Server error
 */
app.post('/api/nft/store', async (req, res) => {
    try {
        const { nftId, name, description, logoUrl, userWalletAddress } = req.body;

        if (!nftId || !name || !description || !logoUrl || !userWalletAddress) {
            return res.status(400).json({
                status: 'error',
                message: 'All fields are required: nftId, name, description, logoUrl, userWalletAddress'
            });
        }

        // Check if NFT with this ID already exists
        const existingNFT = await db.collection('nfts').findOne({ nftId: Number(nftId) });
        if (existingNFT) {
            return res.status(400).json({
                status: 'error',
                message: 'NFT with this ID already exists'
            });
        }

        const result = await db.collection('nfts').insertOne({
            nftId: Number(nftId),
            name,
            description,
            logoUrl,
            userWalletAddress,
            createdAt: new Date()
        });

        logger.info(`NFT data stored successfully for ID: ${nftId}`);

        res.status(201).json({
            status: 'success',
            message: 'NFT data stored successfully',
            data: { _id: result.insertedId }
        });
    } catch (error) {
        logger.error('Error storing NFT:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error while storing NFT'
        });
    }
});

// Start server with database connection retry
const startServer = async () => {
    try {
        await connectToMongo();
        app.listen(port, () => {
            logger.info(`Server is running on port: ${port}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        status: 'error',
        message: 'An unexpected error occurred'
    });
});

// Handle closing the connection when the app is terminated
process.on('SIGINT', async () => {
    await client.close();
    logger.info('MongoDB connection closed.');
    process.exit(0);
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});