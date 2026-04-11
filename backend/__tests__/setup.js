process.env.JWT_SECRET = 'ims_secret_key_123';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

jest.mock('../services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  hasSmtpConfig: true,
}));

jest.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload_stream: jest.fn((options, callback) => {
        callback(null, { secure_url: 'http://mock-cloudinary.url/image.jpg' });
      }),
    },
  },
}));
