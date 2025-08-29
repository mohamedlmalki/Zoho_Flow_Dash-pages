// functions/api/flow-accounts.ts
import { DBStorage } from '../lib/db';

// This handles GET requests to /api/flow-accounts
export const onRequestGet: PagesFunction = async (context) => {
  const storage = new DBStorage();
  const accounts = await storage.getFlowAccounts();
  return new Response(JSON.stringify(accounts), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// This handles POST requests to /api/flow-accounts
export const onRequestPost: PagesFunction = async (context) => {
  const storage = new DBStorage();
  const { name, url } = await context.request.json();
  await storage.createFlowAccount({ name, url });
  const accounts = await storage.getFlowAccounts();
  return new Response(JSON.stringify(accounts), {
    headers: { 'Content-Type': 'application/json' },
    status: 201,
  });
};