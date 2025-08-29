// functions/api/[[path]].ts
import { Hono } from 'hono';
import type { PagesFunction } from '@cloudflare/workers-types';
import { ZodError } from 'zod';
import { insertEmailTemplateSchema, insertEmailCampaignSchema, insertEmailResultSchema, EmailResult } from '../../shared/schema';
import axios from 'axios';

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
    console.error("Error reading flow accounts:", err);
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

// ... (other flow account routes remain the same)

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
         if (error instanceof ZodError) {
            return c.json({ message: "Invalid template data.", error: error.flatten() }, 400);
        }
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
        if (error instanceof ZodError) {
            const formattedError = error.flatten();
            return c.json({ message: "Invalid campaign data.", error: formattedError.fieldErrors }, 400);
        }
        return c.json({ message: "Invalid campaign data.", error: error.message }, 400);
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

// ... (start, pause, stop routes remain the same)
app.post('/campaigns/:id/start', async (c) => {
    const { id } = c.req.param();
    let campaign: any = await c.env.CAMPAIGNS.get(id, 'json');
    if (!campaign) return c.json({ message: 'Campaign not found' }, 404);
    campaign.status = 'running';
    await c.env.CAMPAIGNS.put(id, JSON.stringify(campaign));
    return c.json(campaign);
});

// --- Results Endpoints ---

// THIS IS THE NEW, CORRECTED /results ENDPOINT
app.get('/campaigns/:id/results', async (c) => {
    const { id } = c.req.param();
    const list = await c.env.CAMPAIGNS.list({ prefix: `result-${id}-` });
    const results = await Promise.all(list.keys.map(key => c.env.CAMPAIGNS.get(key.name, 'json')));
    return c.json(results);
});

// THIS IS THE NEW, CORRECTED /send-email ENDPOINT
app.post('/campaigns/:id/send-email', async (c) => {
    const campaignId = c.req.param('id');
    const { email } = await c.req.json();

    let campaign: any = await c.env.CAMPAIGNS.get(campaignId, 'json');
    if (!campaign) {
        return c.json({ message: 'Campaign not found' }, 404);
    }

    const accounts = await readFlowAccounts(c);
    const webhookUrl = accounts[campaign.flowAccount];
    if (!webhookUrl) {
        return c.json({ message: 'Webhook URL not found' }, 500);
    }
    
    const result: Partial<EmailResult> = {
        id: `result-${campaignId}-${crypto.randomUUID()}`,
        campaignId,
        email,
        timestamp: new Date().toISOString(),
    };

    try {
        await axios.post(webhookUrl, {
            senderEmail: email,
            emailSubject: campaign.subject,
            emailDescription: campaign.htmlContent,
        });
        
        result.status = 'success';
        result.response = 'Success';
        campaign.successCount += 1;

    } catch (error: any) {
        result.status = 'failed';
        result.response = error.message || 'Unknown error';
        campaign.failedCount += 1;
    }

    campaign.processedCount += 1;

    // Save both the result and the updated campaign stats
    await Promise.all([
      c.env.CAMPAIGNS.put(result.id!, JSON.stringify(result)),
      c.env.CAMPAIGNS.put(campaignId, JSON.stringify(campaign))
    ]);

    return c.json({ status: result.status });
});


export const onRequest: PagesFunction<Env['Bindings']> = (context) => {
  return app.fetch(context.request, context.env, context);
};