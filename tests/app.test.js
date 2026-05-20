const request = require('supertest');
const app = require('../src/app');

describe('application smoke tests', () => {
  it('returns a standard health response', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'API is healthy',
      data: {},
      meta: {}
    });
  });

  it('serves swagger documentation', async () => {
    await request(app).get('/api-docs/').expect(200);
  });

  it('rejects protected API routes without a JWT', async () => {
    const response = await request(app).get('/api/v1/users').expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Authentication token is required');
  });

  it('exposes item archive status route as a protected API route', async () => {
    const response = await request(app).patch('/api/v1/items/1/status').send({ status: 'inactive' }).expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Authentication token is required');
  });
});
