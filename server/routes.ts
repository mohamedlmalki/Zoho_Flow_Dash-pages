import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEmailTemplateSchema, insertEmailCampaignSchema, insertEmailResultSchema } from "@shared/schema";
import axios from "axios";
import fs from "fs";
import path from "path";

const flowAccountsPath = path.join(process.cwd(), 'server', 'flow_accounts.json');

// Helper function to read accounts from the JSON file
const readFlowAccounts = (): Record<string, string> => {
  try {
    const rawData = fs.readFileSync(flowAccountsPath, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Error reading flow_accounts.json:', error);
    return {};
  }
};

// Helper function to write accounts to the JSON file
const writeFlowAccounts = (accounts: Record<string, string>): void => {
  try {
    fs.writeFileSync(flowAccountsPath, JSON.stringify(accounts, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing to flow_accounts.json:', error);
  }
};


// Map to store active campaign timers (now using setInterval)
const campaignIntervals = new Map<string, NodeJS.Timeout>();

// This function will be called by our new setInterval ticker
async function processSingleEmail(campaignId: string) {
    const campaign = await storage.getEmailCampaign(campaignId);

    // Stop processing if campaign is not found, not running, or is complete
    if (!campaign || campaign.status !== 'running' || campaign.processedCount >= campaign.recipients.length) {
        if (campaignIntervals.has(campaignId)) {
            clearInterval(campaignIntervals.get(campaignId)!);
            campaignIntervals.delete(campaignId);
        }
        // If the campaign is finished, update its status
        if (campaign && campaign.status === 'running') {
            await storage.updateEmailCampaign(campaignId, { status: 'completed' });
        }
        return;
    }

    const email = campaign.recipients[campaign.processedCount];
    const flowAccounts = readFlowAccounts();
    const zohoWebhookUrl = flowAccounts[campaign.flowAccount];

    if (!zohoWebhookUrl) {
        console.error("Zoho Flow URL not found for account:", campaign.flowAccount);
        await storage.updateEmailCampaign(campaignId, { status: 'stopped' });
        // Clean up the interval
        if (campaignIntervals.has(campaignId)) {
            clearInterval(campaignIntervals.get(campaignId)!);
            campaignIntervals.delete(campaignId);
        }
        return;
    }

    try {
        const payload = {
            senderEmail: email,
            emailSubject: campaign.subject,
            emailDescription: campaign.htmlContent
        };
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


export async function registerRoutes(app: Express): Promise<Server> {
  
  // (The top part of the file with /submit, /api/flow-accounts, and /api/templates endpoints remains unchanged)
  // ...

  // Original webhook endpoint for backwards compatibility
  app.post('/submit', async (req, res) => {
    const { flowAccount, email, subject, description } = req.body;
    const flowAccounts = readFlowAccounts();
    const zohoWebhookUrl = flowAccounts[flowAccount];
    if (!zohoWebhookUrl) {
      return res.status(400).json({ message: 'Invalid flow account selected.' });
    }

    const payload = {
      senderEmail: email,
      emailSubject: subject,
      emailDescription: description
    };

    try {
      const response = await axios.post(zohoWebhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      res.json({ 
        message: 'Form submitted successfully and data sent to Zoho Flow!',
        response: response.data 
      });
    } catch (error: any) {
      console.error('Error sending data to Zoho Flow:', error.message);
      res.status(500).json({ message: 'An error occurred while submitting the form.' });
    }
  });

  app.post('/api/flow-accounts/test-connection', async (req, res) => {
    const { name } = req.body;
    const accounts = readFlowAccounts();
    const url = accounts[name];

    if (!url) {
        return res.status(404).json({ message: 'Account not found.' });
    }

    try {
        const response = await axios.post(url, {
            test: 'connection test',
            timestamp: new Date().toISOString(),
        }, { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000 // 10 second timeout
        });
        res.json({ status: 'success', data: response.data });
    } catch (error: any) {
        const errorMessage = error.response ? error.response.data : error.message;
        res.status(500).json({ status: 'failed', data: errorMessage });
    }
});


  // Get flow accounts
  app.get('/api/flow-accounts', (req, res) => {
    res.json(readFlowAccounts());
  });

  // Add a new flow account
  app.post('/api/flow-accounts', (req, res) => {
    const { name, url } = req.body;
    if (!name || !url) {
      return res.status(400).json({ message: 'Name and URL are required' });
    }
    const accounts = readFlowAccounts();
    if (accounts[name]) {
      return res.status(409).json({ message: 'Account name already exists' });
    }
    accounts[name] = url;
    writeFlowAccounts(accounts);
    res.status(201).json(accounts);
  });

  // Update a flow account
  app.put('/api/flow-accounts/:name', (req, res) => {
    const { name } = req.params;
    const { newName, url } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    const accounts = readFlowAccounts();
    if (!accounts[name]) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const finalName = newName || name;

    // If name is being changed, check for conflicts and remove old entry
    if (name !== finalName) {
      if (accounts[finalName]) {
        return res.status(409).json({ message: `Account name "${finalName}" already exists` });
      }
      delete accounts[name];
    }
    
    accounts[finalName] = url;
    writeFlowAccounts(accounts);
    res.json(accounts);
  });

  // Delete a flow account
  app.delete('/api/flow-accounts/:name', (req, res) => {
    const { name } = req.params;
    const accounts = readFlowAccounts();
    if (!accounts[name]) {
      return res.status(404).json({ message: 'Account not found' });
    }
    delete accounts[name];
    writeFlowAccounts(accounts);
    res.json(accounts);
  });


  // Email Templates
  app.get('/api/templates', async (req, res) => {
    try {
      const templates = await storage.getEmailTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/templates', async (req, res) => {
    try {
      const template = insertEmailTemplateSchema.parse(req.body);
      const created = await storage.createEmailTemplate(template);
      res.json(created);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put('/api/templates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const template = insertEmailTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateEmailTemplate(id, template);
      if (!updated) {
        return res.status(404).json({ message: 'Template not found' });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/templates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteEmailTemplate(id);
      if (!deleted) {
        return res.status(404).json({ message: 'Template not found' });
      }
      res.json({ message: 'Template deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Email Campaigns
  app.get('/api/campaigns', async (req, res) => {
    try {
      const campaigns = await storage.getEmailCampaigns();
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/campaigns', async (req, res) => {
    try {
      const campaign = insertEmailCampaignSchema.parse(req.body);
      const created = await storage.createEmailCampaign(campaign);
      res.json(created);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/campaigns/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const campaign = await storage.getEmailCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put('/api/campaigns/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const updated = await storage.updateEmailCampaign(id, updates);
      if (!updated) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Start campaign
  app.post('/api/campaigns/:id/start', async (req, res) => {
    try {
      const { id } = req.params;
      const campaign = await storage.getEmailCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      // Clear any lingering timers before starting a new one
      if (campaignIntervals.has(id)) {
        clearInterval(campaignIntervals.get(id)!);
        campaignIntervals.delete(id);
      }

      const updated = await storage.updateEmailCampaign(id, { status: 'running' });

      // Start the new interval-based processor
      const intervalId = setInterval(() => {
        processSingleEmail(id);
      }, (campaign.delayBetweenEmails || 1) * 1000);
      campaignIntervals.set(id, intervalId);
      
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Pause campaign
  app.post('/api/campaigns/:id/pause', async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateEmailCampaign(id, { status: 'paused' });
      if (!updated) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      
      // Clear the interval when pausing
      if (campaignIntervals.has(id)) {
        clearInterval(campaignIntervals.get(id)!);
        campaignIntervals.delete(id);
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Stop campaign
  app.post('/api/campaigns/:id/stop', async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateEmailCampaign(id, { status: 'stopped' });
      if (!updated) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      // Clear the interval when stopping
      if (campaignIntervals.has(id)) {
        clearInterval(campaignIntervals.get(id)!);
        campaignIntervals.delete(id);
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Send test email
  app.post('/api/test-email', async (req, res) => {
    try {
      const { email, subject, htmlContent, flowAccount } = req.body;
      const flowAccounts = readFlowAccounts();
      const zohoWebhookUrl = flowAccounts[flowAccount];
      if (!zohoWebhookUrl) {
        return res.status(400).json({ message: 'Invalid flow account selected.' });
      }

      const payload = {
        senderEmail: email,
        emailSubject: subject,
        emailDescription: htmlContent
      };

      const response = await axios.post(zohoWebhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      res.json({ 
        message: 'Test email sent successfully!',
        timestamp: new Date().toLocaleTimeString(),
        response: response.data
      });
    } catch (error: any) {
      console.error('Error sending test email:', error.message);
      res.status(500).json({ message: 'Failed to send test email' });
    }
  });

  // Email Results
  app.get('/api/campaigns/:id/results', async (req, res) => {
    try {
      const { id } = req.params;
      const results = await storage.getEmailResults(id);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete('/api/campaigns/:id/results', async (req, res) => {
    try {
      const { id } = req.params;
      await storage.clearEmailResults(id);
      res.json({ message: 'Results cleared successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
