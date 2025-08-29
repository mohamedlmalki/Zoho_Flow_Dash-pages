// functions/api/[[path]].ts
import { Hono } from 'hono';
import type { PagesFunction } from '@cloudflare/workers-types';
import { ZodError } from 'zod';
import { insertEmailTemplateSchema, insertEmailCampaignSchema, EmailResult } from '../../shared/schema';
import axios from 'axios';

type Env = {
  Bindings: {
    ZOHO_ACCOUNTS: KVNamespace;
    CAMPAIGNS: KVNamespace;
  };
};

const app = new Hono<Env>().basePath('/api');

// --- Helper functions ---
const readFlowAccounts = async (c: any): Promise<Record<string, string>> => {
  if (!c.env.ZOHO_ACCOUNTS) throw new Error("KV namespace 'ZOHO_ACCOUNTS' is not bound.");
  return (await c.env.ZOHO_ACCOUNTS.get('accounts', 'json')) || {};
};

// --- Flow Accounts Routes (No changes needed here) ---
app.get('/flow-accounts', async (c) => {
    const accounts = await readFlowAccounts(c);
    return c.json(accounts);
});
app.post('/flow-accounts', async (c) => {
    const { name, url } = await c.req.json();
    if (!name || !url) return c.json({ message: 'Name and URL are required' }, 400);
    const accounts = await readFlowAccounts(c);
    if (accounts[name]) return c.json({ message: 'Account name already exists' }, 409);
    accounts[name] = url;
    await c.env.ZOHO_ACCOUNTS.put('accounts', JSON.stringify(accounts));
    return c.json(accounts, 201);
});
app.put('/flow-accounts/:name', async (c) => {
    const name = c.req.param('name');
    const { newName, url } = await c.req.json();
    if (!url) return c.json({ message: 'URL is required' }, 400);
    const accounts = await readFlowAccounts(c);
    if (!accounts[name]) return c.json({ message: 'Account not found' }, 404);
    const finalName = newName || name;
    if (name !== finalName) {
        if (accounts[finalName]) return c.json({ message: `Account name "${finalName}" already exists` }, 409);
        delete accounts[name];
    }
    accounts[finalName] = url;
    await c.env.ZOHO_ACCOUNTS.put('accounts', JSON.stringify(accounts));
    return c.json(accounts);
});
app.delete('/flow-accounts/:name', async (c) => {
    const name = c.req.param('name');
    const accounts = await readFlowAccounts(c);
    if (!accounts[name]) return c.json({ message: 'Account not found' }, 404);
    delete accounts[name];
    await c.env.ZOHO_ACCOUNTS.put('accounts', JSON.stringify(accounts));
    return c.json(accounts);
});
app.post('/flow-accounts/test-connection', async (c) => {
    const { name } = await c.req.json();
    const accounts = await readFlowAccounts(c);
    const url = accounts[name];
    if (!url) return c.json({ message: 'Account not found.' }, 404);
    try {
        const response = await axios.post(url, { test: 'connection test' }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
        return c.json({ status: 'success', data: response.data });
    } catch (error: any) {
        return c.json({ status: 'failed', data: error.message }, 500);
    }
});


// --- Email Templates Routes (No changes needed here) ---
app.get('/templates', async (c) => {
    const { keys } = await c.env.CAMPAIGNS.list({ prefix: "template-" });
    const templates = await Promise.all(keys.map(key => c.env.CAMPAIGNS.get(key.name, 'json')));
    return c.json(templates);
});
app.post('/templates', async (c) => {
    try {
        const templateData = insertEmailTemplateSchema.parse(await c.req.json());
        const id = `template-${crypto.randomUUID()}`;
        const newTemplate = { ...templateData, id };
        await c.env.CAMPAIGNS.put(id, JSON.stringify(newTemplate));
        return c.json(newTemplate, 201);
    } catch (error: any) {
        if (error instanceof ZodError) return c.json({ message: "Invalid template data.", error: error.flatten() }, 400);
        return c.json({ message: "Could not create template.", error: error.message }, 500);
    }
});


// --- Email Campaigns Routes ---
app.get('/campaigns', async (c) => {
    const { keys } = await c.env.CAMPAIGNS.list({ prefix: "campaign-" });
    const campaigns = await Promise.all(keys.map(key => c.env.CAMPAIGNS.get(key.name, 'json')));
    return c.json(campaigns);
});

app.post('/campaigns', async (c) => {
    try {
        const campaignData = insertEmailCampaignSchema.parse(await c.req.json());
        const id = `campaign-${crypto.randomUUID()}`;
        const newCampaign = { ...campaignData, id, status: "draft", processedCount: 0, successCount: 0, failedCount: 0, createdAt: new Date().toISOString() };
        await c.env.CAMPAIGNS.put(id, JSON.stringify(newCampaign));
        return c.json(newCampaign, 201);
    } catch (error: any) {
        if (error instanceof ZodError) return c.json({ message: "Invalid campaign data.", error: error.flatten().fieldErrors }, 400);
        return c.json({ message: "Could not create campaign.", error: error.message }, 500);
    }
});

app.get('/campaigns/:id', async (c) => {
    const { id } = c.req.param();
    const campaign = await c.env.CAMPAIGNS.get(id, 'json');
    if (!campaign) return c.json({ message: 'Campaign not found' }, 404);
    return c.json(campaign);
});

// FIXED: Added missing status update routes
const statusUpdateHandler = async (c: any, status: 'running' | 'paused' | 'stopped') => {
    const { id } = c.req.param();
    let campaign: any = await c.env.CAMPAIGNS.get(id, 'json');
    if (!campaign) return c.json({ message: 'Campaign not found' }, 404);
    campaign.status = status;
    await c.env.CAMPAIGNS.put(id, JSON.stringify(campaign));
    return c.json(campaign);
};

app.post('/campaigns/:id/start', (c) => statusUpdateHandler(c, 'running'));
app.post('/campaigns/:id/pause', (c) => statusUpdateHandler(c, 'paused'));
app.post('/campaigns/:id/stop', (c) => statusUpdateHandler(c, 'stopped'));


// --- Results Endpoints ---
app.get('/campaigns/:id/results', async (c) => {
    const { id } = c.req.param();
    const list = await c.env.CAMPAIGNS.list({ prefix: `result-${id}-` });
    const results = await Promise.all(list.keys.map(key => c.env.CAMPAIGNS.get(key.name, 'json')));
    return c.json(results);
});

app.post('/campaigns/:id/send-email', async (c) => {
    const campaignId = c.req.param('id');
    const { email } = await c.req.json();
    let campaign: any = await c.env.CAMPAIGNS.get(campaignId, 'json');
    if (!campaign) return c.json({ message: 'Campaign not found' }, 404);
    const accounts = await readFlowAccounts(c);
    const webhookUrl = accounts[campaign.flowAccount];
    if (!webhookUrl) return c.json({ message: 'Webhook URL not found' }, 500);
    
    const result: Partial<EmailResult> = { id: `result-${campaignId}-${crypto.randomUUID()}`, campaignId, email, timestamp: new Date().toISOString() };
    try {
        await axios.post(webhookUrl, { senderEmail: email, emailSubject: campaign.subject, emailDescription: campaign.htmlContent });
        result.status = 'success';
        result.response = 'Success';
        campaign.successCount += 1;
    } catch (error: any) {
        result.status = 'failed';
        result.response = error.message || 'Unknown error';
        campaign.failedCount += 1;
    }
    campaign.processedCount += 1;
    await Promise.all([
      c.env.CAMPAIGNS.put(result.id!, JSON.stringify(result)),
      c.env.CAMPAIGNS.put(campaignId, JSON.stringify(campaign))
    ]);
    return c.json({ status: result.status });
});

// Test email route (no changes needed)
app.post('/api/test-email', async (c) => {
    const { email, subject, htmlContent, flowAccount } = await c.req.json();
    const accounts = await readFlowAccounts(c);
    const webhookUrl = accounts[flowAccount];
    if (!webhookUrl) return c.json({ message: 'Invalid flow account.' }, 400);
    try {
        const response = await axios.post(webhookUrl, { senderEmail: email, emailSubject: subject, emailDescription: htmlContent });
        return c.json({ message: 'Test email sent!', timestamp: new Date().toLocaleTimeString(), response: response.data });
    } catch (error: any) {
        return c.json({ message: 'Failed to send test email' }, 500);
    }
});


export const onRequest: PagesFunction<Env['Bindings']> = (context) => {
  return app.fetch(context.request, context.env, context);
};
