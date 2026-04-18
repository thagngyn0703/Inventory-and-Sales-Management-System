process.env.JWT_SECRET = 'ims_secret_key_123';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
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
