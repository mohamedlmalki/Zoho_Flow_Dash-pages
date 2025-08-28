// functions/api/[[path]].ts
import { Hono } from 'hono';
import type { PagesFunction } from '@cloudflare/workers-types';
import { v4 as uuidv4 } from 'uuid'; // We need a UUID generator

import { insertEmailTemplateSchema, insertEmailCampaignSchema } from '../../shared/schema';
import axios from 'axios';

// Define the environment type for better type-safety
type Env = {
  Bindings: {
    ZOHO_ACCOUNTS: KVNamespace;
    CAMPAIGNS: KVNamespace; // New KV namespace for campaigns
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
    return c.json({ message: "Server configuration error.", error: err.message }, 500);
  }
});
app.post('/flow-accounts', async (c) => {
  try {
    const { name, url } = await c.req.json();
    const accounts = await readFlowAccounts(c);
    accounts[name] = url;
    await writeFlowAccounts(c, accounts);
    return c.json(accounts, 201);
  } catch (err: any) {
    return c.json({ message: "Could not save account.", error: err.message }, 500);
  }
});

// --- Campaign and Result Routes using KV ---

app.get('/campaigns', async (c) => {
    const { keys } = await c.env.CAMPAIGNS.list();
    const campaigns = await Promise.all(keys.map(key => c.env.CAMPAIGNS.get(key.name, 'json')));
    return c.json(campaigns);
});

app.post('/campaigns', async (c) => {
    const campaignData = await c.req.json();
    const id = uuidv4();
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
    return c.json(newCampaign);
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
    // This is a simplified version for now. A more robust solution would use a different KV structure.
    return c.json([]); 
});

// The onRequest export is the entry-point for all requests to your Function.
export const onRequest: PagesFunction<Env['Bindings']> = (context) => {
  return app.fetch(context.request, context.env, context);
};