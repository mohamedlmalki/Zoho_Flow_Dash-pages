// functions/_worker.ts
import { Hono } from 'hono';
import { DBStorage } from './lib/db';
import { insertEmailTemplateSchema, insertEmailCampaignSchema } from '../shared/schema';
import axios from 'axios';

// =================================================================
// CAMPAIGN PROCESSING LOGIC (for the cron job)
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


// =================================================================
// API ROUTER LOGIC (for user requests)
// =================================================================
const app = new Hono().basePath('/api');
const storage = new DBStorage();

// --- All your API routes ---
app.get('/flow-accounts', async (c) => c.json(await storage.getFlowAccounts()));
app.post('/flow-accounts', async (c) => {
    const { name, url } = await c.req.json();
    await storage.createFlowAccount({ name, url });
    return c.json(await storage.getFlowAccounts(), 201);
});
// ... other routes
app.put('/flow-accounts/:name', async (c) => {
    const name = c.req.param('name');
    const { newName, url } = await c.req.json();
    await storage.updateFlowAccount(name, { newName, url });
    return c.json(await storage.getFlowAccounts());
});
app.delete('/flow-accounts/:name', async (c) => {
    const name = c.req.param('name');
    await storage.deleteFlowAccount(name);
    return c.json(await storage.getFlowAccounts());
});
app.post('/flow-accounts/test-connection', async (c) => {
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
app.get('/templates', async (c) => c.json(await storage.getEmailTemplates()));
app.post('/templates', async (c) => {
    const data = await c.req.json();
    const parsed = insertEmailTemplateSchema.parse(data);
    return c.json(await storage.createEmailTemplate(parsed));
});
app.get('/campaigns', async (c) => c.json(await storage.getEmailCampaigns()));
app.get('/campaigns/:id', async (c) => c.json(await storage.getEmailCampaign(c.req.param('id'))));
app.post('/campaigns', async (c) => {
    const data = await c.req.json();
    await storage.deleteCompletedCampaignsByAccount(data.flowAccount);
    const parsed = insertEmailCampaignSchema.parse(data);
    return c.json(await storage.createEmailCampaign(parsed));
});
app.post('/campaigns/:id/start', async (c) => c.json(await storage.updateEmailCampaign(c.req.param('id'), { status: 'running' })));
app.post('/campaigns/:id/pause', async (c) => c.json(await storage.updateEmailCampaign(c.req.param('id'), { status: 'paused' })));
app.post('/campaigns/:id/stop', async (c) => c.json(await storage.updateEmailCampaign(c.req.param('id'), { status: 'stopped' })));
app.get('/campaigns/:id/results', async (c) => c.json(await storage.getEmailResults(c.req.param('id'))));
app.delete('/campaigns/:id/results', async (c) => c.json(await storage.clearEmailResults(c.req.param('id'))));
app.post('/test-email', async (c) => {
    const { email, subject, htmlContent, flowAccount } = await c.req.json();
    const accounts = await storage.getFlowAccounts();
    const url = accounts[flowAccount];
    if (!url) return c.json({ message: 'Invalid flow account' }, 400);
    const payload = { senderEmail: email, emailSubject: subject, emailDescription: htmlContent };
    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
    return c.json({ message: 'Test email sent', timestamp: new Date().toLocaleTimeString(), response: res.data });
});


// =================================================================
// CLOUDFLARE EXPORT
// =================================================================
export default {
    // This handles all API requests (e.g., GET, POST)
    fetch: app.fetch,

    // This handles the scheduled Cron Trigger
    async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext): Promise<void> {
        const cronStorage = new DBStorage();
        const runningCampaigns = await cronStorage.getEmailCampaigns().then(campaigns => 
          campaigns.filter(c => c.status === 'running')
        );

        if (runningCampaigns.length > 0) {
            console.log(`Processing ${runningCampaigns.length} running campaign(s).`);
            const processingPromises = runningCampaigns.map(async (campaign) => {
              const batchSize = campaign.batchSize || 1;
              for (let i = 0; i < batchSize; i++) {
                await processSingleEmail(cronStorage, campaign.id);
              }
            });
            await Promise.all(processingPromises);
        }
    }
};