// functions/api/[[path]].ts
import { Hono } from 'hono';
import type { PagesFunction } from '@cloudflare/workers-types';

import { insertEmailTemplateSchema, insertEmailCampaignSchema } from '../../shared/schema';
import axios from 'axios';

// Define the environment type for better type-safety
type Env = {
  Bindings: {
    ZOHO_ACCOUNTS: KVNamespace;
    CAMPAIGNS: KVNamespace;
  };
};

const app = new Hono<Env>().basePath('/api');

// --- Helper functions for KV ---
const readFlowAccounts = async (c: any): Promise<Record<string, string>> => {
  if (!c.env.ZOHO_ACCOUNTS) {
    throw new Error("KV namespace 'ZOHO_ACCOUNTS' is not bound.");
  }
  return (await c.env.ZOHO_ACCOUNTS.get('accounts', 'json')) || {};
};

const writeFlowAccounts = async (c: any, accounts: Record<string, string>): Promise<void> => {
    if (!c.env.ZOHO_ACCOUNTS) {
    throw new Error("KV namespace 'ZOHO_ACCOUNTS' is not bound.");
  }
  await c.env.ZOHO_ACCOUNTS.put('accounts', JSON.stringify(accounts));
};


// --- Flow Accounts Routes ---

app.get('/flow-accounts', async (c) => {
  try {
    const accounts = await readFlowAccounts(c);
    return c.json(accounts);
  } catch (err: any) {
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
    return c.json({ message: "Could not save account.", error: err.message }, 500);
  }
});

app.put('/flow-accounts/:name', async (c) => {
    try {
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
    } catch (err: any) {
        return c.json({ message: "Could not update account.", error: err.message }, 500);
    }
});

app.delete('/flow-accounts/:name', async (c) => {
    try {
        const name = c.req.param('name');
        const accounts = await readFlowAccounts(c);
        if (!accounts[name]) {
            return c.json({ message: 'Account not found' }, 404);
        }
        delete accounts[name];
        await writeFlowAccounts(c, accounts);
        return c.json(accounts);
    } catch (err: any) {
        return c.json({ message: "Could not delete account.", error: err.message }, 500);
    }
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
        return c.json({ message: "Invalid template data.", error: error }, 400);
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
        const newCampaign = {
            ...campaignData,
            id,
            status: "draft",
            processedCount: 0,
            successCount: 0,
            failedCount: 0,
            createdAt: new Date().toISOString()
        };
        await c.env.CAMPAIGNS.put(id, JSON.stringify(newCampaign));
        return c.json(newCampaign, 201);
    } catch (error: any) {
        return c.json({ message: "Invalid campaign data.", error: error }, 400);
    }
});

app.get('/campaigns/:id', async (c) => {
    const { id } = c.req.param();
    const campaign = await c.env.CAMPAIGNS.get(id, 'json');
    if (!campaign) {
        return c.json({ message: 'Campaign not found' }, 404);
    }
    return c.json(campaign);
});

app.post('/campaigns/:id/start', async (c) => {
    const { id } = c.req.param();
    let campaign: any = await c.env.CAMPAIGNS.get(id, 'json');
    if (!campaign) {
        return c.json({ message: 'Campaign not found' }, 404);
    }
    campaign.status = 'running';
    await c.env.CAMPAIGNS.put(id, JSON.stringify(campaign));
    return c.json(campaign);
});

app.post('/campaigns/:id/pause', async (c) => {
    const { id } = c.req.param();
    let campaign: any = await c.env.CAMPAIGNS.get(id, 'json');
    if (!campaign) {
        return c.json({ message: 'Campaign not found' }, 404);
    }
    campaign.status = 'paused';
    await c.env.CAMPAIGNS.put(id, JSON.stringify(campaign));
    return c.json(campaign);
});

app.post('/campaigns/:id/stop', async (c) => {
    const { id } = c.req.param();
    let campaign: any = await c.env.CAMPAIGNS.get(id, 'json');
    if (!campaign) {
        return c.json({ message: 'Campaign not found' }, 404);
    }
    campaign.status = 'stopped';
    await c.env.CAMPAIGNS.put(id, JSON.stringify(campaign));
    return c.json(campaign);
});

app.get('/campaigns/:id/results', async (c) => {
    return c.json([]); 
});


// --- NEW ROUTE for sending a single campaign email ---
app.post('/campaigns/:id/send-email', async (c) => {
    const { id } = c.req.param();
    const { email } = await c.req.json();

    const campaign: any = await c.env.CAMPAIGNS.get(id, 'json');
    if (!campaign) {
        return c.json({ message: 'Campaign not found' }, 404);
    }

    const accounts = await readFlowAccounts(c);
    const webhookUrl = accounts[campaign.flowAccount];
    if (!webhookUrl) {
        return c.json({ message: 'Webhook URL not found' }, 500);
    }

    try {
        await axios.post(webhookUrl, {
            senderEmail: email,
            emailSubject: campaign.subject,
            emailDescription: campaign.htmlContent,
        });
        
        // Update campaign stats
        campaign.processedCount += 1;
        campaign.successCount += 1;
        await c.env.CAMPAIGNS.put(id, JSON.stringify(campaign));

        return c.json({ status: 'success' });
    } catch (error) {
        campaign.processedCount += 1;
        campaign.failedCount += 1;
        await c.env.CAMPAIGNS.put(id, JSON.stringify(campaign));
        
        return c.json({ status: 'failed' }, 500);
    }
});


export const onRequest: PagesFunction<Env['Bindings']> = (context) => {
  return app.fetch(context.request, context.env, context);
};