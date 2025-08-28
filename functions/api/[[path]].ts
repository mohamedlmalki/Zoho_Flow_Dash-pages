// functions/api/[[path]].ts
import { Hono } from 'hono';
import { handle } from 'hono/vercel';

import { storage } from '../../server/storage'; // We can still use the in-memory storage for now
import { insertEmailTemplateSchema, insertEmailCampaignSchema } from '../../shared/schema';
import axios from 'axios';

// This configures the function to run on Cloudflare's Edge runtime
export const config = {
  runtime: 'edge',
};

// --- Helper functions to read/write flow accounts ---
// In a later step, we will replace this with Cloudflare KV
const readFlowAccounts = (c: any): Record<string, string> => {
    // This is a placeholder. In a real scenario, you would fetch this from a persistent store.
    // For now, we'll return a default value or an empty object.
  return {};
};

const writeFlowAccounts = (c: any, accounts: Record<string, string>): void => {
  // Placeholder for writing to a persistent store.
};


const app = new Hono().basePath('/api');

// --- Flow Accounts Routes ---

app.get('/flow-accounts', (c) => {
  const accounts = readFlowAccounts(c);
  return c.json(accounts);
});

app.post('/flow-accounts', async (c) => {
  const { name, url } = await c.req.json();
  if (!name || !url) {
    return c.json({ message: 'Name and URL are required' }, 400);
  }
  const accounts = readFlowAccounts(c);
  if (accounts[name]) {
    return c.json({ message: 'Account name already exists' }, 409);
  }
  accounts[name] = url;
  writeFlowAccounts(c, accounts);
  return c.json(accounts, 201);
});

app.put('/flow-accounts/:name', async (c) => {
    const name = c.req.param('name');
    const { newName, url } = await c.req.json();

    if (!url) {
        return c.json({ message: 'URL is required' }, 400);
    }

    const accounts = readFlowAccounts(c);
    if (!accounts[name]) {
        return c.json({ message: 'Account not found' }, 404);
    }

    const finalName = newName || name;

    if (name !== finalName) {
        if (accounts[finalName]) {
            return c.json({ message: `Account name "${finalName}" already exists` }, 409);
        }
        delete accounts[name];
    }
    
    accounts[finalName] = url;
    writeFlowAccounts(c, accounts);
    return c.json(accounts);
});

app.delete('/flow-accounts/:name', (c) => {
    const name = c.req.param('name');
    const accounts = readFlowAccounts(c);
    if (!accounts[name]) {
        return c.json({ message: 'Account not found' }, 404);
    }
    delete accounts[name];
    writeFlowAccounts(c, accounts);
    return c.json(accounts);
});

app.post('/flow-accounts/test-connection', async (c) => {
    const { name } = await c.req.json();
    const accounts = readFlowAccounts(c);
    const url = accounts[name];

    if (!url) {
        return c.json({ message: 'Account not found.' }, 404);
    }

    try {
        const response = await axios.post(url, {
            test: 'connection test',
            timestamp: new Date().toISOString(),
        }, { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        return c.json({ status: 'success', data: response.data });
    } catch (error: any) {
        const errorMessage = error.response ? error.response.data : error.message;
        return c.json({ status: 'failed', data: errorMessage }, 500);
    }
});


// --- Email Templates Routes ---

app.get('/templates', async (c) => {
    try {
        const templates = await storage.getEmailTemplates();
        return c.json(templates);
    } catch (error: any) {
        return c.json({ message: error.message }, 500);
    }
});

app.post('/templates', async (c) => {
    try {
        const template = insertEmailTemplateSchema.parse(await c.req.json());
        const created = await storage.createEmailTemplate(template);
        return c.json(created);
    } catch (error: any) {
        return c.json({ message: error.message }, 400);
    }
});

// --- Email Campaigns Routes ---

app.get('/campaigns', async (c) => {
    try {
        const campaigns = await storage.getEmailCampaigns();
        return c.json(campaigns);
    } catch (error: any) {
        return c.json({ message: error.message }, 500);
    }
});

app.get('/campaigns/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const campaign = await storage.getEmailCampaign(id);
        if (!campaign) {
            return c.json({ message: 'Campaign not found' }, 404);
        }
        return c.json(campaign);
    } catch (error: any) {
        return c.json({ message: error.message }, 500);
    }
});

app.post('/campaigns', async (c) => {
    try {
        const campaign = insertEmailCampaignSchema.parse(await c.req.json());
        const created = await storage.createEmailCampaign(campaign);
        return c.json(created);
    } catch (error: any) {
        return c.json({ message: error.message }, 400);
    }
});

// ... Add other campaign routes (start, pause, stop) here in a similar fashion

// --- Test Email Route ---

app.post('/test-email', async (c) => {
    try {
        const { email, subject, htmlContent, flowAccount } = await c.req.json();
        const flowAccounts = readFlowAccounts(c);
        const zohoWebhookUrl = flowAccounts[flowAccount];
        if (!zohoWebhookUrl) {
            return c.json({ message: 'Invalid flow account selected.' }, 400);
        }
        const payload = {
            senderEmail: email,
            emailSubject: subject,
            emailDescription: htmlContent
        };
        const response = await axios.post(zohoWebhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        return c.json({ 
            message: 'Test email sent successfully!',
            timestamp: new Date().toLocaleTimeString(),
            response: response.data
        });
    } catch (error: any) {
        console.error('Error sending test email:', error.message);
        return c.json({ message: 'Failed to send test email' }, 500);
    }
});

export default handle(app);