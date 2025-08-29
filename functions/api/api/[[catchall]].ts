// functions/api/[...catchall].ts
import { Hono } from 'hono';
import { DBStorage } from '../lib/db';
import { insertEmailTemplateSchema, insertEmailCampaignSchema } from '../../shared/schema';
import axios from 'axios'; // We will replace this in the next step

type Bindings = {
  DATABASE_URL: string;
}

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

// Middleware to create storage instance
app.use('*', async (c, next) => {
  const storage = new DBStorage(c.env.DATABASE_URL);
  c.set('storage', storage);
  await next();
});

// --- All API Routes ---
app.get('/flow-accounts', async (c) => c.json(await c.get('storage').getFlowAccounts()));
app.post('/flow-accounts', async (c) => {
    const storage = c.get('storage');
    const { name, url } = await c.req.json();
    await storage.createFlowAccount({ name, url });
    return c.json(await storage.getFlowAccounts(), 201);
});
app.put('/flow-accounts/:name', async (c) => {
    const storage = c.get('storage');
    const name = c.req.param('name');
    const { newName, url } = await c.req.json();
    await storage.updateFlowAccount(name, { newName, url });
    return c.json(await storage.getFlowAccounts());
});
app.delete('/flow-accounts/:name', async (c) => {
    const storage = c.get('storage');
    const name = c.req.param('name');
    await storage.deleteFlowAccount(name);
    return c.json(await storage.getFlowAccounts());
});
app.post('/flow-accounts/test-connection', async (c) => {
    const storage = c.get('storage');
    const { name } = await c.req.json();
    const accounts = await storage.getFlowAccounts();
    const url = accounts[name];
    if (!url) return c.json({ message: 'Account not found.' }, 404);
    try {
        const res = await axios.post(url, { test: 'connection test' }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
        return c.json({ status: 'success', data: res.data });
    } catch (e) {
        return c.json({ status: 'failed', data: e.message }, 500);
    }
});
app.get('/templates', async (c) => c.json(await c.get('storage').getEmailTemplates()));
app.post('/templates', async (c) => {
    const storage = c.get('storage');
    const data = await c.req.json();
    const parsed = insertEmailTemplateSchema.parse(data);
    return c.json(await storage.createEmailTemplate(parsed));
});
app.get('/campaigns', async (c) => c.json(await c.get('storage').getEmailCampaigns()));
app.get('/campaigns/:id', async (c) => c.json(await c.get('storage').getEmailCampaign(c.req.param('id'))));
app.post('/campaigns', async (c) => {
    const storage = c.get('storage');
    const data = await c.req.json();
    await storage.deleteCompletedCampaignsByAccount(data.flowAccount);
    const parsed = insertEmailCampaignSchema.parse(data);
    return c.json(await storage.createEmailCampaign(parsed));
});
app.post('/campaigns/:id/start', async (c) => c.json(await c.get('storage').updateEmailCampaign(c.req.param('id'), { status: 'running' })));
app.post('/campaigns/:id/pause', async (c) => c.json(await c.get('storage').updateEmailCampaign(c.req.param('id'), { status: 'paused' })));
app.post('/campaigns/:id/stop', async (c) => c.json(await c.get('storage').updateEmailCampaign(c.req.param('id'), { status: 'stopped' })));
app.get('/campaigns/:id/results', async (c) => c.json(await c.get('storage').getEmailResults(c.req.param('id'))));
app.delete('/campaigns/:id/results', async (c) => c.json(await c.get('storage').clearEmailResults(c.req.param('id'))));
app.post('/test-email', async (c) => {
    const storage = c.get('storage');
    const { email, subject, htmlContent, flowAccount } = await c.req.json();
    const accounts = await storage.getFlowAccounts();
    const url = accounts[flowAccount];
    if (!url) return c.json({ message: 'Invalid flow account' }, 400);
    const payload = { senderEmail: email, emailSubject: subject, emailDescription: htmlContent };
    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }});
    return c.json({ message: 'Test email sent', timestamp: new Date().toLocaleTimeString(), response: await res.json() });
});

export const onRequest = (context: any) => {
    return app.fetch(context.request, context.env, context);
};