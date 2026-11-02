import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/civic_db';
const client = new MongoClient(mongoUri);

export const mongoDb = client.db('civic_db');
