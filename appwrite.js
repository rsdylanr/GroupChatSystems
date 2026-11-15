import { Client } from 'https://cdn.jsdelivr.net/npm/appwrite@latest/+esm';

const client = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('6af90788000f332cbde1');

const pingAppwrite = async () => {
  try {
    const response = await client.ping();
    console.log('[Appwrite] ping OK', response);
  } catch (error) {
    console.error('[Appwrite] ping failed', error);
  }
};

export { client, pingAppwrite };
