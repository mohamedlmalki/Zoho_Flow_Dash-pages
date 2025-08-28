// functions/api/[[path]].ts
import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages'; // Use the specific Cloudflare Pages adapter

import { storage } from '../../server/storage';
import { insertEmailTemplateSchema, insertEmailCampaignSchema } from '../../shared/schema';
import axios from 'axios';

// Define the environment type for better type-safety
type Env = {
  Bindings: {
    ZOHO_ACCOUNTS: KVNamespace;
  };
};

const app = new Hono<Env>().basePath('/api');

// --- Helper functions for KV ---
const readFlowAccounts = async (c: any): Promise<Record<string, string>> => {
  if (!c.env.ZOHO_ACCOUNTS) {
    throw new Error("KV namespace 'ZOHO_ACCOUNTS' is not bound or configured in your Cloudflare project.");
  }
  // Use a default empty object if the key doesn't exist yet
  return (await c.env.ZOHO_ACCOUNTS.get('accounts', 'json')) || {};
};

const writeFlowAccounts = async (c: any, accounts: Record<string, string>): Promise<void> => {
    if (!c.env.ZOHO_ACCOUNTS) {
    throw new Error("KV namespace 'ZOHO_ACCOUNTS' is not bound or configured in your Cloudflare project.");
  }
  await c.env.ZOHO_ACCOUNTS.put('accounts', JSON.stringify(accounts));
};


// --- Flow Accounts Routes ---

app.get('/flow-accounts', async (c) => {
  try {
    const accounts = await readFlowAccounts(c);
    return c.json(accounts);
  } catch (err: any) {
    console.error("Error reading from KV:", err);
    return c.json({ message: "Server configuration error reading accounts.", error: err.message }, 500);
  }
});

app.post('/flow-accounts', async (c) => {
  try {
    const { name, url } = await c.req.json();
    if (!name || !url) {
      return c.json({ message: 'Name and URL are required' }, 400);
    }
    const accounts = await readFlowAccounts(c);
    if (accounts[name]) {
      return c.json({ message: 'Account name already exists' }, 409);
    }
    accounts[name] = url;
    await writeFlowAccounts(c, accounts);
    return c.json(accounts, 201);
  } catch (err: any) {
    console.error("Error writing to KV:", err);
    return c.json({ message: "Could not save account.", error: err.message }, 500);
  }
});

app.put('/flow-accounts/:name', async (c) => {
    const name = c.req.param('name');
    const { newName, url } = await c.req.json();

    if (!url) {
        return c.json({ message: 'URL is required' }, 400);
    }

    const accounts = await readFlowAccounts(c);
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
    await writeFlowAccounts(c, accounts);
    return c.json(accounts);
});

app.delete('/flow-accounts/:name', async (c) => {
    const name = c.req.param('name');
    const accounts = await readFlowAccounts(c);
    if (!accounts[name]) {
        return c.json({ message: 'Account not found' }, 404);
    }
    delete accounts[name];
    await writeFlowAccounts(c, accounts);
    return c.json(accounts);
});

app.post('/flow-accounts/test-connection', async (c) => {
    const { name } = await c.req.json();
    const accounts = await readFlowAccounts(c);
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

// --- Test Email Route ---

app.post('/test-email', async (c) => {
    try {
        const { email, subject, htmlContent, flowAccount } = await c.req.json();
        const flowAccounts = await readFlowAccounts(c);
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

// Use Hono's built-in Cloudflare Pages adapter
export const onRequest = handle(app);