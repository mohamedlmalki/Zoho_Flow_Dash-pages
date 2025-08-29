// functions/_worker.ts
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { DBStorage } from './lib/db';
import { insertEmailTemplateSchema, insertEmailCampaignSchema } from '../shared/schema';
import axios from 'axios';

export const config = {
  runtime: 'edge',
};

const storage = new DBStorage();

// --- API LOGIC (for user requests) ---
const app = new Hono().basePath('/api');

// ... (All your existing app.get, app.post, etc. routes go here)
// --- Flow Accounts ---
app.get('/flow-accounts', async (c) => {
  const accounts = await storage.getFlowAccounts();
  return c.json(accounts);
});

app.post('/flow-accounts', async (c) => {
  const { name, url } = await c.req.json();
  if (!name || !url) {
    return c.json({ message: 'Name and URL are required' }, 400);
  }
  const accounts = await storage.getFlowAccounts();
  if (accounts[name]) {
    return c.json({ message: 'Account name already exists' }, 409);
  }
  await storage.createFlowAccount({ name, url });
  const updatedAccounts = await storage.getFlowAccounts();
  return c.json(updatedAccounts, 201);
});

app.put('/flow-accounts/:name', async (c) => {
    const name = c.req.param('name');
    const { newName, url } = await c.req.json();
    if (!url) {
        return c.json({ message: 'URL is required' }, 400);
    }
    await storage.updateFlowAccount(name, { newName, url });
    const updatedAccounts = await storage.getFlowAccounts();
    return c.json(updatedAccounts);
});

app.delete('/flow-accounts/:name', async (c) => {
    const name = c.req.param('name');
    await storage.deleteFlowAccount(name);
    const updatedAccounts = await storage.getFlowAccounts();
    return c.json(updatedAccounts);
});

app.post('/flow-accounts/test-connection', async (c) => {
    const { name } = await c.req.json();
    const accounts = await storage.getFlowAccounts();
    const url = accounts[name];
    if (!url) {
        return c.json({ message: 'Account not found.' }, 404);
    }
    try {
        const response = await axios.post(url, { test: 'connection test' }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
        return c.json({ status: 'success', data: response.data });
    } catch (error: any) {
        const errorMessage = error.response ? error.response.data : error.message;
        return c.json({ status: 'failed', data: errorMessage }, 500);
    }
});


// --- Email Templates ---
app.get('/templates', async (c) => {
    const templates = await storage.getEmailTemplates();
    return c.json(templates);
});

app.post('/templates', async (c) => {
    const templateData = await c.req.json();
    const template = insertEmailTemplateSchema.parse(templateData);
    const created = await storage.createEmailTemplate(template);
    return c.json(created);
});


// --- Email Campaigns ---
app.get('/campaigns', async (c) => {
    const campaigns = await storage.getEmailCampaigns();
    return c.json(campaigns);
});

app.get('/campaigns/:id', async (c) => {
    const id = c.req.param('id');
    const campaign = await storage.getEmailCampaign(id);
    if (!campaign) {
        return c.json({ message: 'Campaign not found' }, 404);
    }
    return c.json(campaign);
});

app.post('/campaigns', async (c) => {
    const campaignData = await c.req.json();
    await storage.deleteCompletedCampaignsByAccount(campaignData.flowAccount);
    const campaign = insertEmailCampaignSchema.parse(campaignData);
    const created = await storage.createEmailCampaign(campaign);
    return c.json(created);
});

// --- Campaign Actions ---
app.post('/campaigns/:id/start', async (c) => {
    const id = c.req.param('id');
    const updated = await storage.updateEmailCampaign(id, { status: 'running' });
    return c.json(updated);
});

app.post('/campaigns/:id/pause', async (c) => {
    const id = c.req.param('id');
    const updated = await storage.updateEmailCampaign(id, { status: 'paused' });
    return c.json(updated);
});

app.post('/campaigns/:id/stop', async (c) => {
    const id = c.req.param('id');
    const updated = await storage.updateEmailCampaign(id, { status: 'stopped' });
    return c.json(updated);
});


// --- Email Results ---
app.get('/campaigns/:id/results', async (c) => {
    const id = c.req.param('id');
    const results = await storage.getEmailResults(id);
    return c.json(results);
});

app.delete('/campaigns/:id/results', async (c) => {
    const id = c.req.param('id');
    await storage.clearEmailResults(id);
    return c.json({ message: 'Results cleared successfully' });
});


// --- Test Email ---
app.post('/test-email', async (c) => {
    const { email, subject, htmlContent, flowAccount } = await c.req.json();
    const flowAccounts = await storage.getFlowAccounts();
    const zohoWebhookUrl = flowAccounts[flowAccount];

    if (!zohoWebhookUrl) {
        return c.json({ message: 'Invalid flow account selected.' }, 400);
    }

    try {
        const payload = { senderEmail: email, emailSubject: subject, emailDescription: htmlContent };
        const response = await axios.post(zohoWebhookUrl, payload, { headers: { 'Content-Type': 'application/json' } });
        return c.json({
            message: 'Test email sent successfully!',
            timestamp: new Date().toLocaleTimeString(),
            response: response.data
        });
    } catch (error: any) {
        return c.json({ message: 'Failed to send test email' }, 500);
    }
});

// --- CRON TRIGGER LOGIC (for background processing) ---
async function processSingleEmail(campaignId: string) {
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

const cron = {
  // This is the main function for the Cron Trigger
  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext): Promise<void> {
    console.log("Cron job running at:", new Date().toISOString());

    const runningCampaigns = await storage.getEmailCampaigns().then(campaigns => 
      campaigns.filter(c => c.status === 'running')
    );

    if (runningCampaigns.length === 0) {
      console.log("No running campaigns to process.");
      return;
    }

    console.log(`Found ${runningCampaigns.length} running campaign(s).`);

    // Process one batch for each running campaign
    const processingPromises = runningCampaigns.map(async (campaign) => {
      const batchSize = campaign.batchSize || 1; // Default to 1 if not set
      console.log(`Processing batch of ${batchSize} for campaign ${campaign.id}`);
      for (let i = 0; i < batchSize; i++) {
        await processSingleEmail(campaign.id);
      }
    });

    await Promise.all(processingPromises);
    console.log("Cron job finished.");
  },
};

// This exports BOTH the API handler and the Cron Trigger handler
export default {
  fetch: handle(app),
  scheduled: cron.scheduled,
};