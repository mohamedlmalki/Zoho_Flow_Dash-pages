// functions/_worker.ts
import { Hono } from 'hono';
import { DBStorage } from './lib/db';
import { insertEmailTemplateSchema, insertEmailCampaignSchema } from '../shared/schema';
import axios from 'axios';

type Bindings = {
  DATABASE_URL: string;
}

const app = new Hono<{ Bindings: Bindings }>();

// Middleware to create a single storage instance per request
app.use('*', async (c, next) => {
  const storage = new DBStorage(c.env.DATABASE_URL);
  c.set('storage', storage);
  await next();
});

// --- API Routes ---
app.get('/api/flow-accounts', async (c) => c.json(await c.get('storage').getFlowAccounts()));
app.post('/api/flow-accounts', async (c) => {
    const storage = c.get('storage');
    const { name, url } = await c.req.json();
    await storage.createFlowAccount({ name, url });
    return c.json(await storage.getFlowAccounts(), 201);
});
app.put('/api/flow-accounts/:name', async (c) => {
    const storage = c.get('storage');
    const name = c.req.param('name');
    const { newName, url } = await c.req.json();
    await storage.updateFlowAccount(name, { newName, url });
    return c.json(await storage.getFlowAccounts());
});
app.delete('/api/flow-accounts/:name', async (c) => {
    const storage = c.get('storage');
    const name = c.req.param('name');
    await storage.deleteFlowAccount(name);
    return c.json(await storage.getFlowAccounts());
});
app.post('/api/flow-accounts/test-connection', async (c) => {
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
app.get('/api/templates', async (c) => c.json(await c.get('storage').getEmailTemplates()));
app.post('/api/templates', async (c) => {
    const storage = c.get('storage');
    const data = await c.req.json();
    const parsed = insertEmailTemplateSchema.parse(data);
    return c.json(await storage.createEmailTemplate(parsed));
});
app.get('/api/campaigns', async (c) => c.json(await c.get('storage').getEmailCampaigns()));
app.get('/api/campaigns/:id', async (c) => c.json(await c.get('storage').getEmailCampaign(c.req.param('id'))));
app.post('/api/campaigns', async (c) => {
    const storage = c.get('storage');
    const data = await c.req.json();
    await storage.deleteCompletedCampaignsByAccount(data.flowAccount);
    const parsed = insertEmailCampaignSchema.parse(data);
    return c.json(await storage.createEmailCampaign(parsed));
});
app.post('/api/campaigns/:id/start', async (c) => c.json(await c.get('storage').updateEmailCampaign(c.req.param('id'), { status: 'running' })));
app.post('/api/campaigns/:id/pause', async (c) => c.json(await c.get('storage').updateEmailCampaign(c.req.param('id'), { status: 'paused' })));
app.post('/api/campaigns/:id/stop', async (c) => c.json(await c.get('storage').updateEmailCampaign(c.req.param('id'), { status: 'stopped' })));
app.get('/api/campaigns/:id/results', async (c) => c.json(await c.get('storage').getEmailResults(c.req.param('id'))));
app.delete('/api/campaigns/:id/results', async (c) => c.json(await c.get('storage').clearEmailResults(c.req.param('id'))));
app.post('/api/test-email', async (c) => {
    const storage = c.get('storage');
    const { email, subject, htmlContent, flowAccount } = await c.req.json();
    const accounts = await storage.getFlowAccounts();
    const url = accounts[flowAccount];
    if (!url) return c.json({ message: 'Invalid flow account' }, 400);
    const payload = { senderEmail: email, emailSubject: subject, emailDescription: htmlContent };
    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
    return c.json({ message: 'Test email sent', timestamp: new Date().toLocaleTimeString(), response: res.data });
});


// =================================================================
// CRON TRIGGER AND EXPORT
// =================================================================
async function processSingleEmail(storage: DBStorage, campaignId: string) {
    const campaign = await storage.getEmailCampaign(campaignId);
    if (!campaign || campaign.status !== 'running' || campaign.processedCount >= campaign.recipients.length) {
        if (campaign && campaign.status === 'running') {
             await storage.updateEmailCampaign(campaignId, { status: 'completed' });
        }
        return;
    }
    const email = campaign.recipients[campaign.processedCount];
    const flowAccounts = await storage.getFlowAccounts();
    const zohoWebhookUrl = flowAccounts[campaign.flowAccount];
    if (!zohoWebhookUrl) {
        await storage.updateEmailCampaign(campaignId, { status: 'stopped' });
        return;
    }
    try {
        const payload = { senderEmail: email, emailSubject: campaign.subject, emailDescription: campaign.htmlContent };
        await axios.post(zohoWebhookUrl, payload, { headers: { 'Content-Type': 'application/json' } });
        await storage.createEmailResult({ campaignId, email, status: 'success', response: 'Success' });
        await storage.updateEmailCampaign(campaignId, {
            processedCount: campaign.processedCount + 1,
            successCount: campaign.successCount + 1
        });
    } catch (error: any) {
        await storage.createEmailResult({ campaignId, email, status: 'failed', response: error.message });
        await storage.updateEmailCampaign(campaignId, {
            processedCount: campaign.processedCount + 1,
            failedCount: campaign.failedCount + 1
        });
    }
}

export default {
    fetch: app.fetch,
    async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
        const storage = new DBStorage(env.DATABASE_URL);
        const runningCampaigns = await storage.getEmailCampaigns().then(campaigns => 
          campaigns.filter(c => c.status === 'running')
        );

        if (runningCampaigns.length > 0) {
            const processingPromises = runningCampaigns.map(async (campaign) => {
              const batchSize = campaign.batchSize || 1;
              for (let i = 0; i < batchSize; i++) {
                await processSingleEmail(storage, campaign.id);
              }
            });
            await Promise.all(processingPromises);
        }
    }
};