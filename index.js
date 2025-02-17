const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
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
    swaggerDefinition: {
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

const swaggerDocs = swaggerJsDoc(swaggerOptions);

// MongoDB Atlas Connection URL
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xd8rz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const dbName = 'nft-database';

// Create a MongoClient with options
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db;

// Connect to MongoDB Atlas
async function connectToMongo() {
    try {
        await client.connect();
        logger.info("Connected to MongoDB Atlas!");
        db = client.db(dbName);
    } catch (error) {
        logger.error('MongoDB connection error:', error);
        process.exit(1); // Exit if we can't connect to the database
    }
}

// Middleware
app.use(cors({
    origin: 'http://localhost:3000', // Adjust this to your frontend URL
    methods: 'GET,POST',
    credentials: true
}));
app.use(express.json());
app.use(helmet()); // Adds secure headers
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

/**
 * @swagger
 * /api/nft/store:
 *   post:
 *     summary: Store NFT data
 *     description: Stores the provided NFT data under the provided NFT ID
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
 *         description: Error storing NFT data
 */
app.post('/api/nft/store', async (req, res) => {
    try {
        const { nftId, name, description, logoUrl, userWalletAddress } = req.body;

        // Validate required fields
        if (!nftId || !name || !description || !logoUrl || !userWalletAddress) {
            return res.status(400).json({
                status: 'error',
                message: 'All fields are required: nftId, name, description, logoUrl, userWalletAddress'
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
            message: 'NFT data stored successfully'
        });
    } catch (error) {
        logger.error('Error storing NFT:', error);
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/nft/{nftId}:
 *   get:
 *     summary: Get NFT by ID
 *     description: Retrieves NFT data stored under the provided NFT ID
 *     parameters:
 *       - in: path
 *         name: nftId
 *         required: true
 *         schema:
 *           type: number
 *         description: The NFT ID
 *     responses:
 *       200:
 *         description: NFT data retrieved successfully
 *       404:
 *         description: NFT not found
 *       400:
 *         description: Error retrieving NFT data
 */
app.get('/api/nft/:nftId', async (req, res) => {
    try {
        const nft = await db.collection('nfts').findOne({
            nftId: Number(req.params.nftId)
        });

        if (!nft) {
            logger.warn(`NFT not found for ID: ${req.params.nftId}`);
            return res.status(404).json({
                status: 'error',
                message: 'NFT not found'
            });
        }

        logger.info(`NFT retrieved successfully for ID: ${req.params.nftId}`);

        res.status(200).json({
            status: 'success',
            data: nft
        });
    } catch (error) {
        logger.error('Error retrieving NFT:', error);
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/nft/gallery/{userWalletAddress}:
 *   get:
 *     summary: Get NFT Gallery
 *     description: Retrieves a list of NFT data objects created by the provided user wallet address
 *     parameters:
 *       - in: path
 *         name: userWalletAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: The user's wallet address
 *     responses:
 *       200:
 *         description: NFT gallery retrieved successfully
 *       400:
 *         description: Error retrieving NFT gallery
 */
app.get('/api/nft/gallery/:userWalletAddress', async (req, res) => {
    try {
        const nfts = await db.collection('nfts')
            .find({ userWalletAddress: req.params.userWalletAddress })
            .toArray();

        logger.info(`Gallery retrieved successfully for wallet: ${req.params.userWalletAddress}`);

        res.status(200).json({
            status: 'success',
            data: nfts
        });
    } catch (error) {
        logger.error('Error retrieving gallery:', error);
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
});

// Error handling middleware - catches any errors not handled in routes
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        status: 'error',
        message: 'An unexpected error occurred'
    });
});

// Connect to MongoDB then start the server
connectToMongo().then(() => {
    app.listen(port, () => {
        logger.info(`Server is running on port: ${port}`);
    });
}).catch(error => {
    logger.error('Failed to start server:', error);
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
